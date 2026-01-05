#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""iOS MJPEG Stream Manager - 使用 go-ios screenshot stream

基于 go-ios 的实时截图流替代轮询方案
"""

import logging
import socket
from typing import Optional

from byteautoui.remote.ios_screenshot_server import IOSScreenshotServer

logger = logging.getLogger(__name__)


class IOSMJPEGStream:
    """
    iOS MJPEG 流管理（基于 go-ios screenshot stream）

    使用 go-ios 的 screenshot --stream 功能提供 MJPEG 流
    性能优于轮询截图方式

    注意：
    - go-ios 默认使用 3333 端口，可通过 --port 指定
    - 需要先启动 go-ios tunnel (userspace mode)
    """

    def __init__(self, device_udid: str, wda_port: int = 8100, mjpeg_port: Optional[int] = None):
        """
        Args:
            device_udid: iOS 设备 UDID
            wda_port: WDA 端口（占位，兼容性保留）
            mjpeg_port: MJPEG 流端口（None 表示自动选择可用端口）
        """
        self.device_udid = device_udid
        self.mjpeg_port = mjpeg_port
        self._screenshot_server: Optional[IOSScreenshotServer] = None
        logger.info(
            "iOS MJPEG stream manager initialized for device %s (port: %s)",
            device_udid,
            str(self.mjpeg_port) if self.mjpeg_port is not None else "<auto>",
        )

    @staticmethod
    def _is_port_available(port: int) -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False

    def _pick_port(self) -> int:
        if self.mjpeg_port is not None:
            return self.mjpeg_port
        for port in range(3333, 3433):
            if self._is_port_available(port):
                return port
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            return int(sock.getsockname()[1])

    def start_recording(self) -> bool:
        """
        启动 MJPEG 流（启动 go-ios screenshot stream 服务器）

        Returns:
            bool: 启动成功返回 True
        """
        if self._screenshot_server and self._screenshot_server.is_running():
            logger.info("Screenshot stream already running")
            return True

        try:
            port = self._pick_port()
            # 创建并启动 screenshot server
            self._screenshot_server = IOSScreenshotServer(
                device_udid=self.device_udid,
                port=port,
            )

            success = self._screenshot_server.start()

            if success:
                self.mjpeg_port = port
                logger.info(f"iOS MJPEG stream started at port {self.mjpeg_port}")
            else:
                logger.error("Failed to start iOS MJPEG stream")
                self._screenshot_server = None

            return success

        except Exception as e:
            logger.error(f"Failed to start screenshot stream: {e}")
            self._screenshot_server = None
            return False

    def stop_recording(self) -> bool:
        """
        停止 MJPEG 流

        Returns:
            bool: 停止成功返回 True
        """
        if not self._screenshot_server:
            return True

        try:
            success = self._screenshot_server.stop()
            self._screenshot_server = None

            if success:
                logger.info("iOS MJPEG stream stopped")

            return success

        except Exception as e:
            logger.error(f"Failed to stop screenshot stream: {e}")
            return False

    def get_mjpeg_url(self) -> str:
        """
        返回 MJPEG 流 URL

        Returns:
            str: MJPEG 流 URL
        """
        if self._screenshot_server:
            return self._screenshot_server.get_mjpeg_url()
        if self.mjpeg_port is None:
            return "http://127.0.0.1:3333"
        return f"http://127.0.0.1:{self.mjpeg_port}"

    def is_stream_available(self) -> bool:
        """
        检查 MJPEG 流是否可用

        Returns:
            bool: 流可用返回 True
        """
        if not self._screenshot_server:
            return False

        return self._screenshot_server.is_running()

    def close(self):
        """清理资源"""
        self.stop_recording()
