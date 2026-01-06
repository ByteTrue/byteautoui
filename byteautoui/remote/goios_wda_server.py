#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Go-iOS WDA Server Manager - 使用go-ios启动和管理WDA"""

import logging
import socket
import subprocess
import time
import threading
from typing import Optional, Dict, Set

from byteautoui.utils.ios_config import get_ios_config_manager
from byteautoui.remote.ios_tunnel_manager import get_tunnel_manager

logger = logging.getLogger(__name__)

# 全局设备启动锁字典，防止并发启动同一设备
_device_locks: Dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()  # 保护_device_locks字典本身
_active_servers_lock = threading.Lock()
_active_servers: Set["GoIOSWDAServer"] = set()


def _get_device_lock(udid: str) -> threading.Lock:
    """获取特定设备的启动锁"""
    with _locks_lock:
        if udid not in _device_locks:
            _device_locks[udid] = threading.Lock()
        return _device_locks[udid]


class GoIOSWDAServer:
    """
    使用go-ios管理WDA生命周期

    职责：
    1. 启动go-ios tunnel (iOS 17+需要)
    2. 启动WDA (使用ios runwda命令)
    3. 端口转发 (8100:8100 for HTTP, 9100:9100 for MJPEG)
    4. 监控进程健康状态并自动恢复
    5. 清理资源
    """

    # WDA MJPEG 默认端口
    DEFAULT_MJPEG_PORT = 9100

    # 监控配置
    MONITOR_INTERVAL = 5  # 每5秒检查一次
    RESTART_COOLDOWN = 10  # 重启冷却时间，防止频繁重启

    def __init__(self, device_udid: str, wda_bundle_id: Optional[str] = None, wda_port: Optional[int] = None, mjpeg_port: Optional[int] = None):
        """
        Args:
            device_udid: 设备UDID
            wda_bundle_id: WDA的bundle ID，如果为None则从配置读取或使用默认值
            wda_port: WDA端口，如果为None则从配置读取或使用8100
            mjpeg_port: MJPEG端口，如果为None则使用默认9100
        """
        self.device_udid = device_udid
        self._wda_process: Optional[subprocess.Popen] = None
        self._forward_process: Optional[subprocess.Popen] = None
        self._mjpeg_forward_process: Optional[subprocess.Popen] = None

        # 日志文件句柄
        self._wda_log_file = None
        self._forward_log_file = None
        self._mjpeg_forward_log_file = None

        # 监控线程
        self._monitor_thread: Optional[threading.Thread] = None
        self._monitor_stop_event = threading.Event()
        self._last_restart_time = 0  # 上次重启时间

        # 获取配置管理器
        self._config_manager = get_ios_config_manager()

        # 获取全局tunnel管理器
        self._tunnel_manager = get_tunnel_manager()

        # 确定WDA bundle ID和端口
        if wda_bundle_id is None:
            self.wda_bundle_id = self._config_manager.get_wda_bundle_id(device_udid)
        else:
            self.wda_bundle_id = wda_bundle_id
            self._config_manager.set_wda_bundle_id(device_udid, wda_bundle_id)

        if wda_port is None:
            self.wda_port = self._config_manager.get_wda_port(device_udid)
        else:
            self.wda_port = wda_port
            self._config_manager.set_wda_port(device_udid, wda_port)

        # MJPEG 端口配置
        self.mjpeg_port = mjpeg_port or self.DEFAULT_MJPEG_PORT

        logger.info(f"GoIOSWDAServer initialized for {device_udid[:8]}... with bundle_id={self.wda_bundle_id}, port={self.wda_port}, mjpeg_port={self.mjpeg_port}")
        with _active_servers_lock:
            _active_servers.add(self)

    @classmethod
    def cleanup_all(cls):
        """应用退出时关闭所有由本进程创建的 WDA/forward 进程"""
        with _active_servers_lock:
            servers = list(_active_servers)
        for server in servers:
            try:
                server.close()
            except Exception:
                logger.exception(
                    "Failed to close GoIOSWDAServer for %s",
                    getattr(server, "device_udid", "<unknown>"),
                )

    def start(self):
        """
        启动WDA服务（带设备锁，防止并发启动）

        流程：
        1. 启动go-ios tunnel (使用全局单例，多设备共享)
        2. 端口转发
        3. 检查WDA是否已可用
        4. 必要时启动WDA并等待ready
        5. 启动监控线程
        """
        # 获取设备锁，防止并发启动
        device_lock = _get_device_lock(self.device_udid)

        with device_lock:
            if self._is_wda_running():
                logger.info(f"WDA already running on port {self.wda_port}")
                self._start_monitor()  # 确保监控线程运行
                return

            start_time = time.time()
            logger.info(f"Starting WDA for device {self.device_udid} using go-ios")

            try:
                # 步骤1: 启动tunnel (针对该设备)
                tunnel_time = time.time()
                if not self._tunnel_manager.start_tunnel(self.device_udid):
                    raise RuntimeError(f"Failed to start tunnel for device {self.device_udid}")
                tunnel_cost = time.time() - tunnel_time

                # 如果端口被占用但WDA没运行，清理残留进程
                if self._is_port_open(self.wda_port, timeout=0.5) and not self._is_wda_running():
                    logger.warning(
                        f"Port {self.wda_port} is occupied but WDA is not responding, cleaning up..."
                    )
                    self._cleanup_stale_processes()
                    self._wait_for_port_close(timeout=2)

                # 步骤2: 端口转发 (WDA HTTP + MJPEG)
                forward_time = time.time()
                self._start_port_forward()
                self._start_mjpeg_port_forward()
                forward_cost = time.time() - forward_time

                # 步骤3: 快速检查：WDA已可用则直接复用
                if self._wait_for_wda_ready(timeout=2):
                    logger.info(
                        "WDA already running on port %s (tunnel %.2fs, forward %.2fs, total %.2fs)",
                        self.wda_port,
                        tunnel_cost,
                        forward_cost,
                        time.time() - start_time,
                    )
                    self._start_monitor()  # 启动监控
                    return

                # 步骤4: 启动WDA并等待ready
                wda_time = time.time()
                self._start_wda()
                if not self._wait_for_wda_ready(timeout=30):
                    raise RuntimeError(
                        f"WDA failed to start within 30 seconds on port {self.wda_port}"
                    )
                wda_ready_cost = time.time() - wda_time

                logger.info(
                    "WDA started successfully on port %s (tunnel %.2fs, forward %.2fs, ready %.2fs, total %.2fs)",
                    self.wda_port,
                    tunnel_cost,
                    forward_cost,
                    wda_ready_cost,
                    time.time() - start_time,
                )

                # 步骤5: 启动监控线程
                self._start_monitor()

            except Exception as e:
                self.close()
                raise RuntimeError(f"Failed to start WDA: {e}")

    def _start_monitor(self):
        """启动监控线程"""
        if self._monitor_thread and self._monitor_thread.is_alive():
            return  # 监控线程已在运行

        self._monitor_stop_event.clear()
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            name=f"WDAMonitor-{self.device_udid[:8]}",
            daemon=True
        )
        self._monitor_thread.start()
        logger.info(f"Monitor thread started for device {self.device_udid[:8]}...")

    def _stop_monitor(self):
        """停止监控线程"""
        if not self._monitor_thread:
            return

        self._monitor_stop_event.set()
        if self._monitor_thread.is_alive():
            self._monitor_thread.join(timeout=2)
        self._monitor_thread = None
        logger.info(f"Monitor thread stopped for device {self.device_udid[:8]}...")

    def _monitor_loop(self):
        """监控循环：定期检查进程健康状态"""
        logger.info(f"Monitor loop started for device {self.device_udid[:8]}...")

        while not self._monitor_stop_event.wait(timeout=self.MONITOR_INTERVAL):
            try:
                # 检查1: tunnel进程是否还活着
                if not self._tunnel_manager.is_tunnel_running(self.device_udid):
                    logger.error(f"Tunnel process died for device {self.device_udid[:8]}..., attempting restart")
                    self._attempt_restart()
                    continue

                # 检查2: WDA进程是否还活着
                if self._wda_process and self._wda_process.poll() is not None:
                    logger.error(f"WDA process died (exit code: {self._wda_process.returncode}), attempting restart")
                    self._attempt_restart()
                    continue

                # 检查3: 端口转发进程是否还活着
                if self._forward_process and self._forward_process.poll() is not None:
                    logger.error(f"Port forward process died (exit code: {self._forward_process.returncode}), attempting restart")
                    self._attempt_restart()
                    continue

                # 检查4: WDA HTTP健康检查
                if not self._is_wda_running():
                    logger.error(f"WDA health check failed for device {self.device_udid[:8]}..., attempting restart")
                    self._attempt_restart()
                    continue

                # 全部检查通过
                logger.debug(f"Health check passed for device {self.device_udid[:8]}...")

            except Exception as e:
                logger.error(f"Error in monitor loop for device {self.device_udid[:8]}...: {e}")

        logger.info(f"Monitor loop exited for device {self.device_udid[:8]}...")

    def _attempt_restart(self):
        """尝试重启WDA（带冷却时间保护）"""
        current_time = time.time()

        # 检查冷却时间，防止频繁重启
        if current_time - self._last_restart_time < self.RESTART_COOLDOWN:
            logger.warning(
                f"Restart cooldown active for device {self.device_udid[:8]}... "
                f"(last restart: {current_time - self._last_restart_time:.1f}s ago)"
            )
            return

        self._last_restart_time = current_time
        logger.info(f"Attempting to restart WDA for device {self.device_udid[:8]}...")

        try:
            # 清理现有进程
            self._cleanup_processes()

            # 重新启动（不使用锁，因为我们在监控线程中）
            start_time = time.time()

            # 重启tunnel
            if not self._tunnel_manager.start_tunnel(self.device_udid, force=True):
                raise RuntimeError(f"Failed to restart tunnel for device {self.device_udid}")

            # 重启端口转发
            self._start_port_forward()
            self._start_mjpeg_port_forward()

            # 重启WDA
            self._start_wda()
            if not self._wait_for_wda_ready(timeout=30):
                raise RuntimeError(f"WDA failed to restart within 30 seconds")

            logger.info(
                f"WDA restarted successfully for device {self.device_udid[:8]}... "
                f"(took {time.time() - start_time:.2f}s)"
            )

        except Exception as e:
            logger.error(f"Failed to restart WDA for device {self.device_udid[:8]}...: {e}")

    def _cleanup_processes(self):
        """清理所有子进程（不清理tunnel，由TunnelManager管理）"""
        # 关闭端口转发（WDA HTTP）
        if self._forward_process:
            try:
                self._forward_process.terminate()
                self._forward_process.wait(timeout=2)
            except Exception:
                try:
                    self._forward_process.kill()
                except Exception:
                    pass
            finally:
                self._forward_process = None

        # 关闭端口转发日志文件
        if self._forward_log_file:
            try:
                self._forward_log_file.close()
            except Exception:
                pass
            finally:
                self._forward_log_file = None

        # 关闭端口转发（MJPEG）
        if self._mjpeg_forward_process:
            try:
                self._mjpeg_forward_process.terminate()
                self._mjpeg_forward_process.wait(timeout=2)
            except Exception:
                try:
                    self._mjpeg_forward_process.kill()
                except Exception:
                    pass
            finally:
                self._mjpeg_forward_process = None

        # 关闭 MJPEG 端口转发日志文件
        if self._mjpeg_forward_log_file:
            try:
                self._mjpeg_forward_log_file.close()
            except Exception:
                pass
            finally:
                self._mjpeg_forward_log_file = None

        # 关闭WDA
        if self._wda_process:
            try:
                self._wda_process.terminate()
                self._wda_process.wait(timeout=2)
            except Exception:
                try:
                    self._wda_process.kill()
                except Exception:
                    pass
            finally:
                self._wda_process = None

        # 关闭 WDA 日志文件
        if self._wda_log_file:
            try:
                self._wda_log_file.close()
            except Exception:
                pass
            finally:
                self._wda_log_file = None

    def _start_wda(self):
        """启动WDA"""
        if self._wda_process and self._wda_process.poll() is None:
            return
        logger.info(f"Starting WDA with bundle ID: {self.wda_bundle_id}")

        # 打开日志文件（w模式覆盖旧日志）
        log_path = f"/tmp/wda_{self.device_udid[:8]}.log"
        self._wda_log_file = open(log_path, "w", buffering=1)  # 行缓冲

        cmd = [
            "ios",
            "runwda",
            f"--bundleid={self.wda_bundle_id}",
            f"--testrunnerbundleid={self.wda_bundle_id}",
            "--xctestconfig=WebDriverAgentRunner.xctest",
            f"--udid={self.device_udid}"
        ]

        # 重定向 stdout/stderr 到日志文件
        self._wda_process = subprocess.Popen(
            cmd,
            stdout=self._wda_log_file,
            stderr=subprocess.STDOUT,  # 合并 stderr 到 stdout
        )

        time.sleep(0.3)

        if self._wda_process.poll() is not None:
            exit_code = self._wda_process.returncode
            self._wda_process = None  # 清理引用，避免资源泄漏

            # 关闭日志文件并读取最后几行
            self._wda_log_file.close()
            try:
                with open(log_path, "r") as f:
                    log_lines = f.readlines()
                    last_lines = "".join(log_lines[-10:]) if log_lines else "(no logs)"
            except Exception:
                last_lines = "(failed to read logs)"
            finally:
                self._wda_log_file = None

            raise RuntimeError(
                f"WDA failed to start (exit code: {exit_code})\n"
                f"请检查:\n"
                f"1. WDA是否已安装到设备 (bundle ID: {self.wda_bundle_id})\n"
                f"2. bundle ID是否正确\n"
                f"3. 查看详细日志: {log_path}\n"
                f"最后几行输出:\n{last_lines}"
            )

        logger.info(f"WDA process started (logs: {log_path})")

    def _start_port_forward(self):
        """启动端口转发（WDA HTTP）"""
        if self._forward_process and self._forward_process.poll() is None:
            return
        logger.info(f"Starting port forward {self.wda_port}:{self.wda_port}")

        # 打开日志文件
        log_path = f"/tmp/wda_forward_{self.device_udid[:8]}_{self.wda_port}.log"
        self._forward_log_file = open(log_path, "w", buffering=1)

        cmd = [
            "ios",
            "forward",
            str(self.wda_port),
            str(self.wda_port),
            f"--udid={self.device_udid}"
        ]

        # 重定向 stdout/stderr 到日志文件
        self._forward_process = subprocess.Popen(
            cmd,
            stdout=self._forward_log_file,
            stderr=subprocess.STDOUT,
        )

        time.sleep(0.3)

        if self._forward_process.poll() is not None:
            exit_code = self._forward_process.returncode
            self._forward_process = None  # 清理引用，避免资源泄漏

            # 关闭日志文件并读取最后几行
            self._forward_log_file.close()
            try:
                with open(log_path, "r") as f:
                    log_lines = f.readlines()
                    last_lines = "".join(log_lines[-10:]) if log_lines else "(no logs)"
            except Exception:
                last_lines = "(failed to read logs)"
            finally:
                self._forward_log_file = None

            raise RuntimeError(
                f"Port forward failed (exit code: {exit_code})\n"
                f"详细日志: {log_path}\n"
                f"最后几行输出:\n{last_lines}"
            )

        logger.info(f"Port forward established (logs: {log_path})")

    def _start_mjpeg_port_forward(self):
        """启动端口转发（WDA MJPEG）"""
        if self._mjpeg_forward_process and self._mjpeg_forward_process.poll() is None:
            return
        logger.info(f"Starting MJPEG port forward {self.mjpeg_port}:{self.mjpeg_port}")

        # 打开日志文件
        log_path = f"/tmp/wda_mjpeg_forward_{self.device_udid[:8]}_{self.mjpeg_port}.log"
        self._mjpeg_forward_log_file = open(log_path, "w", buffering=1)

        cmd = [
            "ios",
            "forward",
            str(self.mjpeg_port),
            str(self.mjpeg_port),
            f"--udid={self.device_udid}"
        ]

        # 重定向 stdout/stderr 到日志文件
        self._mjpeg_forward_process = subprocess.Popen(
            cmd,
            stdout=self._mjpeg_forward_log_file,
            stderr=subprocess.STDOUT,
        )

        time.sleep(0.3)

        if self._mjpeg_forward_process.poll() is not None:
            # MJPEG 端口转发失败不是致命错误，只记录警告
            logger.warning(
                f"MJPEG port forward failed (exit code: {self._mjpeg_forward_process.returncode})\n"
                f"详细日志: {log_path}"
            )
            # 关闭日志文件
            if self._mjpeg_forward_log_file:
                self._mjpeg_forward_log_file.close()
            self._mjpeg_forward_process = None
            self._mjpeg_forward_log_file = None
            return

        logger.info(f"MJPEG port forward established (logs: {log_path})")

    def _is_port_open(self, port: int, timeout: float = 1) -> bool:
        """检查端口是否可连接"""
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=timeout):
                return True
        except (socket.timeout, ConnectionRefusedError, OSError):
            return False

    def _is_wda_running(self) -> bool:
        """检查WDA是否真正运行（通过/status端点）"""
        import json
        from http.client import HTTPConnection

        if not self._is_port_open(self.wda_port, timeout=0.5):
            return False

        try:
            conn = HTTPConnection("127.0.0.1", self.wda_port, timeout=2)
            conn.request("GET", "/status")
            response = conn.getresponse()

            if response.status != 200:
                return False

            data = json.loads(response.read())
            # 检查返回格式是否正确
            if "value" in data and isinstance(data["value"], dict):
                if "ready" in data["value"] or "state" in data["value"]:
                    logger.debug(f"WDA status check passed: {data}")
                    return True

            return False
        except Exception as e:
            logger.debug(f"WDA status check failed: {e}")
            return False
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def _wait_for_port_close(self, timeout: float = 2) -> bool:
        """等待端口释放"""
        start = time.time()
        while time.time() - start < timeout:
            if not self._is_port_open(self.wda_port, timeout=0.1):
                return True
            time.sleep(0.1)
        return False

    def _wait_for_wda_ready(self, timeout: float = 30) -> bool:
        """等待WDA ready（/status 可用）"""
        start = time.time()
        logger.debug(f"Waiting for WDA ready on port {self.wda_port}...")

        while time.time() - start < timeout:
            # 检查进程是否还在运行
            if self._forward_process and self._forward_process.poll() is not None:
                logger.error(f"Port forward process died (exit code: {self._forward_process.returncode})")
                return False

            if self._wda_process and self._wda_process.poll() is not None:
                logger.error(f"WDA process died (exit code: {self._wda_process.returncode})")
                return False

            if self._is_wda_running():
                logger.info(f"WDA ready on port {self.wda_port}")
                return True

            time.sleep(0.2)

        return False

    def is_alive(self) -> bool:
        """检查WDA是否运行中"""
        return (
            self._wda_process is not None and
            self._wda_process.poll() is None and
            self._is_port_open(self.wda_port, timeout=0.5)
        )

    def _cleanup_stale_processes(self):
        """清理残留的go-ios进程（针对当前设备和端口）"""
        import platform
        import signal

        try:
            # 查找占用端口的进程
            if platform.system() == "Darwin":  # macOS
                result = subprocess.run(
                    ["lsof", "-ti", f":{self.wda_port}"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                pids = result.stdout.strip().split('\n')
                for pid_str in pids:
                    if pid_str:
                        try:
                            pid = int(pid_str)
                            logger.info(f"Killing stale process on port {self.wda_port}: PID {pid}")
                            subprocess.run(["kill", "-9", str(pid)], timeout=2)
                        except Exception as e:
                            logger.debug(f"Failed to kill PID {pid_str}: {e}")

            elif platform.system() == "Linux":
                result = subprocess.run(
                    ["fuser", "-k", f"{self.wda_port}/tcp"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                logger.info(f"Killed processes on port {self.wda_port}")

            # Windows暂不处理，留给用户手动清理

        except Exception as e:
            logger.warning(f"Failed to cleanup stale processes: {e}")

    def close(self):
        """
        清理WDA资源
        """
        with _active_servers_lock:
            _active_servers.discard(self)

        # 先停止监控线程
        self._stop_monitor()

        logger.info("Closing go-ios WDA server")

        # 清理所有子进程
        self._cleanup_processes()

        # 通知tunnel管理器释放设备
        self._tunnel_manager.release_device(self.device_udid)

        logger.info("go-ios WDA server closed")

    def __del__(self):
        """析构时自动清理"""
        self.close()
