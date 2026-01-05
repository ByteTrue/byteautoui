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
    4. 清理资源
    """

    # WDA MJPEG 默认端口
    DEFAULT_MJPEG_PORT = 9100

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
        """
        # 获取设备锁，防止并发启动
        device_lock = _get_device_lock(self.device_udid)

        with device_lock:
            if self._is_wda_running():
                logger.info(f"WDA already running on port {self.wda_port}")
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

            except Exception as e:
                self.close()
                raise RuntimeError(f"Failed to start WDA: {e}")

    def _start_wda(self):
        """启动WDA"""
        if self._wda_process and self._wda_process.poll() is None:
            return
        logger.info(f"Starting WDA with bundle ID: {self.wda_bundle_id}")

        cmd = [
            "ios",
            "runwda",
            f"--bundleid={self.wda_bundle_id}",
            f"--testrunnerbundleid={self.wda_bundle_id}",
            "--xctestconfig=WebDriverAgentRunner.xctest",
            f"--udid={self.device_udid}"
        ]

        self._wda_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        time.sleep(0.2)

        if self._wda_process.poll() is not None:
            # 进程已退出，读取错误
            stdout, stderr = self._wda_process.communicate()
            error_msg = stderr or stdout
            if "Did not find test app" in error_msg:
                raise RuntimeError(
                    f"WDA未安装或bundle ID错误\n\n"
                    f"请检查:\n"
                    f"1. WDA是否已安装到设备 (bundle ID: {self.wda_bundle_id})\n"
                    f"2. bundle ID是否正确\n\n"
                    f"设置正确的bundle ID:\n"
                    f"  前端配置对话框中输入正确的bundle ID\n\n"
                    f"原始错误: {error_msg}"
                )
            raise RuntimeError(f"WDA failed to start: {error_msg}")

        logger.info("WDA process started")

    def _start_port_forward(self):
        """启动端口转发（WDA HTTP）"""
        if self._forward_process and self._forward_process.poll() is None:
            return
        logger.info(f"Starting port forward {self.wda_port}:{self.wda_port}")

        cmd = [
            "ios",
            "forward",
            str(self.wda_port),
            str(self.wda_port),
            f"--udid={self.device_udid}"
        ]

        self._forward_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        time.sleep(0.2)

        if self._forward_process.poll() is not None:
            _, stderr = self._forward_process.communicate()
            raise RuntimeError(f"Port forward failed: {stderr}")

        logger.info("Port forward established")

    def _start_mjpeg_port_forward(self):
        """启动端口转发（WDA MJPEG）"""
        if self._mjpeg_forward_process and self._mjpeg_forward_process.poll() is None:
            return
        logger.info(f"Starting MJPEG port forward {self.mjpeg_port}:{self.mjpeg_port}")

        cmd = [
            "ios",
            "forward",
            str(self.mjpeg_port),
            str(self.mjpeg_port),
            f"--udid={self.device_udid}"
        ]

        self._mjpeg_forward_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        time.sleep(0.2)

        if self._mjpeg_forward_process.poll() is not None:
            _, stderr = self._mjpeg_forward_process.communicate()
            # MJPEG 端口转发失败不是致命错误，只记录警告
            logger.warning(f"MJPEG port forward failed (will fallback to WDA HTTP): {stderr}")
            self._mjpeg_forward_process = None
            return

        logger.info("MJPEG port forward established")

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
            except:
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
                _, stderr = self._forward_process.communicate()
                logger.error(f"Port forward process died: {stderr}")
                return False

            if self._wda_process and self._wda_process.poll() is not None:
                stdout, stderr = self._wda_process.communicate()
                logger.error(f"WDA process died: {stderr or stdout}")
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
        logger.info("Closing go-ios WDA server")

        # 关闭端口转发（WDA HTTP）
        if self._forward_process:
            try:
                self._forward_process.terminate()
                self._forward_process.wait(timeout=2)
            except Exception as e:
                logger.debug(f"Error closing forward process: {e}")
                try:
                    self._forward_process.kill()
                except:
                    pass
            finally:
                self._forward_process = None

        # 关闭端口转发（MJPEG）
        if self._mjpeg_forward_process:
            try:
                self._mjpeg_forward_process.terminate()
                self._mjpeg_forward_process.wait(timeout=2)
            except Exception as e:
                logger.debug(f"Error closing MJPEG forward process: {e}")
                try:
                    self._mjpeg_forward_process.kill()
                except:
                    pass
            finally:
                self._mjpeg_forward_process = None

        # 关闭WDA
        if self._wda_process:
            try:
                self._wda_process.terminate()
                self._wda_process.wait(timeout=2)
            except Exception as e:
                logger.debug(f"Error closing WDA process: {e}")
                try:
                    self._wda_process.kill()
                except:
                    pass
            finally:
                self._wda_process = None

        # 通知tunnel管理器释放设备
        self._tunnel_manager.release_device(self.device_udid)

        logger.info("go-ios WDA server closed")

    def __del__(self):
        """析构时自动清理"""
        self.close()
