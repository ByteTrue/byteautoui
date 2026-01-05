#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""iOS Screenshot Stream Server - 使用 go-ios screenshot --stream

基于 go-ios 的 MJPEG 截图流服务器管理
参考: https://github.com/danielpaulus/go-ios
"""

import logging
import subprocess
import threading
import time
from typing import Optional

from byteautoui.remote.ios_tunnel_manager import get_tunnel_manager

logger = logging.getLogger(__name__)

_active_servers_lock = threading.Lock()
_active_servers: set["IOSScreenshotServer"] = set()


class IOSScreenshotServer:
    """
    iOS 截图流服务器（使用 go-ios screenshot --stream）

    go-ios 的 screenshot --stream 命令默认在 3333 端口启动 MJPEG 服务器，
    也可通过 --port 指定其它端口。
    提供实时截图流，性能优于轮询方式

    注意：复用 WDA 启动时的 tunnel（全局单例管理）
    """

    def __init__(self, device_udid: str, port: int = 3333):
        """
        Args:
            device_udid: iOS 设备 UDID
            port: MJPEG 流端口（默认 3333，可通过 go-ios --port 自定义）
        """
        self.device_udid = device_udid
        self.port = port
        self._screenshot_process: Optional[subprocess.Popen] = None
        self._is_running = False
        self._stdout_thread: Optional[threading.Thread] = None

        # 使用全局 tunnel 管理器（与 WDA 共享）
        self._tunnel_manager = get_tunnel_manager()

    def _drain_stdout(self):
        process = self._screenshot_process
        if not process or not process.stdout:
            return
        try:
            for line in process.stdout:
                logger.debug("[go-ios screenshot] %s", line.rstrip())
        except Exception:
            logger.debug("Failed to read screenshot stream stdout", exc_info=True)

    def _check_stream_available(self, timeout: float = 5) -> bool:
        """检查 MJPEG 流是否真正可用"""
        import socket
        start = time.time()

        while time.time() - start < timeout:
            try:
                # 尝试连接端口
                with socket.create_connection(("127.0.0.1", self.port), timeout=1):
                    logger.info(f"MJPEG stream port {self.port} is accessible")
                    return True
            except (socket.timeout, ConnectionRefusedError, OSError):
                # 检查进程是否还活着
                if self._screenshot_process and self._screenshot_process.poll() is not None:
                    # 进程退出了，读取错误
                    stdout, _ = self._screenshot_process.communicate()
                    logger.error("Screenshot process died: %s", stdout)
                    return False
                time.sleep(0.5)

        return False

    def start(self) -> bool:
        """
        启动 go-ios screenshot stream 进程

        步骤：
        1. 复用 WDA 已启动的 tunnel（全局管理器）
        2. 启动 go-ios screenshot stream (固定端口 3333)
        3. 验证 MJPEG 流可用

        Returns:
            bool: 启动成功返回 True
        """
        if self._is_running:
            logger.info(f"Screenshot stream already running on port {self.port}")
            return True

        try:
            # Step 1: 确保 tunnel 已启动（复用并计数，避免特殊情况）
            if not self._tunnel_manager.start_tunnel(self.device_udid):
                raise RuntimeError(f"Failed to start tunnel for device {self.device_udid}")

            # Step 2: 启动 screenshot stream
            screenshot_cmd = [
                "ios",
                "screenshot",
                "--udid",
                self.device_udid,
                "--stream",
                "--port",
                str(self.port),
            ]

            logger.info(f"Starting iOS screenshot stream: {' '.join(screenshot_cmd)}")

            self._screenshot_process = subprocess.Popen(
                screenshot_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True
            )

            # Step 3: 验证流是否真正可用（而不仅仅检查进程存在）
            if self._check_stream_available(timeout=8):
                self._is_running = True
                self._stdout_thread = threading.Thread(
                    target=self._drain_stdout,
                    name=f"goios-screenshot-{self.device_udid[:8]}",
                    daemon=True,
                )
                self._stdout_thread.start()
                with _active_servers_lock:
                    _active_servers.add(self)
                logger.info(f"iOS screenshot stream started and verified on port {self.port}")
                return True
            else:
                # 流不可用，清理进程
                if self._screenshot_process:
                    if self._screenshot_process.poll() is None:
                        # 进程还活着但流不可用
                        logger.error("Screenshot stream process running but port not accessible")
                        self._screenshot_process.terminate()
                    self._screenshot_process = None
                self._tunnel_manager.release_device(self.device_udid)
                return False

        except FileNotFoundError:
            logger.error("go-ios CLI not found. Please install: brew install danielpaulus/homebrew-tap/go-ios")
            self._tunnel_manager.release_device(self.device_udid)
            return False
        except Exception as e:
            logger.error(f"Failed to start screenshot stream: {e}")
            if self._screenshot_process:
                self._screenshot_process.kill()
                self._screenshot_process = None
            self._tunnel_manager.release_device(self.device_udid)
            return False

    def stop(self) -> bool:
        """
        停止 screenshot stream 进程

        注意：不停止 tunnel（由全局管理器统一管理）

        Returns:
            bool: 停止成功返回 True
        """
        if not self._is_running:
            return True

        try:
            with _active_servers_lock:
                _active_servers.discard(self)

            # 只停止 screenshot stream
            if self._screenshot_process:
                logger.info("Stopping iOS screenshot stream...")
                try:
                    self._screenshot_process.terminate()
                    try:
                        self._screenshot_process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        self._screenshot_process.kill()
                        self._screenshot_process.wait()
                except Exception as e:
                    logger.error(f"Failed to stop screenshot process: {e}")
                    return False
                finally:
                    self._screenshot_process = None

            self._is_running = False
            self._tunnel_manager.release_device(self.device_udid)
            logger.info("iOS screenshot stream stopped")
            return True

        except Exception as e:
            logger.error(f"Failed to stop screenshot stream: {e}")
            return False

    def get_mjpeg_url(self) -> str:
        """
        返回 MJPEG 流 URL

        Returns:
            str: MJPEG 流 URL（本地）
        """
        return f"http://127.0.0.1:{self.port}"

    def is_running(self) -> bool:
        """
        检查 screenshot stream 是否运行中

        Returns:
            bool: 运行中返回 True
        """
        if not self._is_running:
            return False

        # 检查 screenshot 进程状态
        if self._screenshot_process and self._screenshot_process.poll() is None:
            return True
        else:
            # 进程已退出
            self._is_running = False
            self._screenshot_process = None
            return False

    @classmethod
    def cleanup_all(cls):
        """应用关闭时关闭所有由本进程创建的 screenshot stream 进程"""
        with _active_servers_lock:
            servers = list(_active_servers)
            _active_servers.clear()
        for server in servers:
            try:
                server.stop()
            except Exception:
                logger.exception(
                    "Failed to stop IOSScreenshotServer for %s",
                    getattr(server, "device_udid", "<unknown>"),
                )

    def close(self):
        """清理资源"""
        self.stop()

    def __del__(self):
        """析构时自动清理"""
        self.close()
