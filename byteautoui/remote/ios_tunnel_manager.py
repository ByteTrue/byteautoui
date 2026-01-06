#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""iOS Tunnel Manager - 管理每个设备的go-ios tunnel进程"""

import logging
import subprocess
import threading
import time
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class IOSTunnelManager:
    """
    全局单例，管理所有iOS设备的tunnel进程

    每个设备有独立的tunnel进程（带--udid参数），但支持复用和引用计数
    """

    _instance: Optional['IOSTunnelManager'] = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                instance = super().__new__(cls)
                # 实例属性（不是类变量）
                instance._tunnel_processes: Dict[str, subprocess.Popen] = {}
                instance._tunnel_log_files: Dict[str, object] = {}  # 日志文件句柄
                instance._device_ref_counts: Dict[str, int] = {}
                cls._instance = instance
            return cls._instance

    @classmethod
    def get_instance(cls) -> 'IOSTunnelManager':
        """获取单例实例"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def is_tunnel_running(self, udid: str) -> bool:
        """检查特定设备的tunnel进程是否正在运行"""
        # 首先检查我们管理的进程
        if udid in self._tunnel_processes:
            process = self._tunnel_processes[udid]
            if process.poll() is None:
                return True
            else:
                # 进程已死，清理
                del self._tunnel_processes[udid]
                if udid in self._device_ref_counts:
                    del self._device_ref_counts[udid]
                if udid in self._tunnel_log_files:
                    try:
                        self._tunnel_log_files[udid].close()
                    except Exception:
                        pass
                    del self._tunnel_log_files[udid]

        # 检查系统中是否有该设备的tunnel进程
        try:
            result = subprocess.run(
                ["pgrep", "-f", f"ios tunnel start.*{udid}"],
                capture_output=True,
                text=True,
                timeout=2
            )
            return result.returncode == 0 and bool(result.stdout.strip())
        except Exception as e:
            logger.debug(f"Failed to check tunnel process for {udid}: {e}")
            return False

    def start_tunnel(self, udid: str, force: bool = False) -> bool:
        """
        启动特定设备的tunnel进程（如果尚未运行）

        Args:
            udid: 设备UDID
            force: 强制重启tunnel

        Returns:
            是否成功启动或已在运行
        """
        # 如果该设备的tunnel已经在运行，增加引用计数
        if not force and self.is_tunnel_running(udid):
            logger.info(f"Tunnel for device {udid[:8]}... already running, reusing")
            self._device_ref_counts[udid] = self._device_ref_counts.get(udid, 0) + 1
            return True

        # 如果需要强制重启，先关闭旧的
        if force and udid in self._tunnel_processes:
            self._stop_tunnel(udid)

        logger.info(f"Starting tunnel for device {udid[:8]}...")

        try:
            # 打开日志文件
            log_path = f"/tmp/ios_tunnel_{udid[:8]}.log"
            log_file = open(log_path, "w", buffering=1)

            cmd = [
                "ios",
                "tunnel",
                "start",
                f"--udid={udid}",
                "--userspace"
            ]

            # 重定向 stdout/stderr 到日志文件
            process = subprocess.Popen(
                cmd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
            )

            time.sleep(0.3)

            if process.poll() is not None:
                # 进程启动失败，读取日志
                log_file.close()
                try:
                    with open(log_path, "r") as f:
                        log_lines = f.readlines()
                        last_lines = "".join(log_lines[-10:]) if log_lines else "(no logs)"
                except Exception:
                    last_lines = "(failed to read logs)"

                raise RuntimeError(
                    f"Tunnel failed to start (exit code: {process.returncode})\n"
                    f"请检查:\n"
                    f"1. go-ios 是否已正确安装\n"
                    f"2. 设备 {udid[:8]}... 是否已连接并信任\n"
                    f"3. 详细日志: {log_path}\n"
                    f"最后几行输出:\n{last_lines}"
                )

            self._tunnel_processes[udid] = process
            self._tunnel_log_files[udid] = log_file
            self._device_ref_counts[udid] = 1
            logger.info(f"Tunnel started successfully for {udid[:8]}... (ref_count: 1, logs: {log_path})")
            return True

        except Exception as e:
            logger.error(f"Failed to start tunnel for {udid}: {e}")
            if udid in self._tunnel_processes:
                del self._tunnel_processes[udid]
            if udid in self._tunnel_log_files:
                try:
                    self._tunnel_log_files[udid].close()
                except Exception:
                    pass
                del self._tunnel_log_files[udid]
            return False

    def release_device(self, udid: str):
        """设备释放tunnel使用权（设备断开时调用）"""
        if udid not in self._device_ref_counts:
            return

        self._device_ref_counts[udid] -= 1
        logger.debug(f"Device {udid[:8]}... released tunnel (ref_count: {self._device_ref_counts[udid]})")

        # 如果引用计数为0，可以选择关闭tunnel（这里保持运行，等待cleanup）
        # 保持运行可以加快下次连接速度

    def _stop_tunnel(self, udid: str):
        """停止特定设备的tunnel进程"""
        if udid not in self._tunnel_processes:
            return

        process = self._tunnel_processes[udid]
        try:
            process.terminate()
            process.wait(timeout=2)
            logger.info(f"Tunnel terminated for {udid[:8]}...")
        except Exception as e:
            logger.debug(f"Error terminating tunnel for {udid}: {e}")
            try:
                process.kill()
                logger.info(f"Tunnel killed for {udid[:8]}...")
            except Exception:
                pass
        finally:
            del self._tunnel_processes[udid]
            if udid in self._device_ref_counts:
                del self._device_ref_counts[udid]

            # 关闭日志文件
            if udid in self._tunnel_log_files:
                try:
                    self._tunnel_log_files[udid].close()
                except Exception:
                    pass
                del self._tunnel_log_files[udid]

    def cleanup(self):
        """清理所有资源（应用关闭时调用）"""
        logger.info("Cleaning up iOS tunnel manager...")

        # 关闭所有管理的tunnel进程
        for udid in list(self._tunnel_processes.keys()):
            self._stop_tunnel(udid)

        # 清理可能残留的tunnel进程
        try:
            subprocess.run(
                ["pkill", "-f", "ios tunnel start"],
                timeout=2,
                capture_output=True
            )
            logger.info("Cleaned up stale tunnel processes")
        except Exception as e:
            logger.debug(f"Failed to cleanup stale processes: {e}")


# 全局单例实例
_tunnel_manager: Optional[IOSTunnelManager] = None


def get_tunnel_manager() -> IOSTunnelManager:
    """获取全局tunnel管理器实例"""
    global _tunnel_manager
    if _tunnel_manager is None:
        _tunnel_manager = IOSTunnelManager.get_instance()
    return _tunnel_manager
