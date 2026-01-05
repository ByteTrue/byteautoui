#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""iOS MJPEG Stream Manager - 使用 WDA 原生 MJPEG 端点

WDA (WebDriverAgent) 内置 MJPEG 服务器，默认端口 9100，帧率 ~10 FPS。
相比 go-ios screenshot --stream，WDA 原生 MJPEG 更高效稳定。

参考：https://github.com/appium/WebDriverAgent
"""

import logging
import socket
import time
from typing import Optional

logger = logging.getLogger(__name__)

# WDA MJPEG 默认端口（WebDriverAgent 内置）
DEFAULT_WDA_MJPEG_PORT = 9100


class IOSMJPEGStream:
    """
    iOS MJPEG 流管理（使用 WDA 原生 MJPEG 端点）

    WDA 启动时会在 9100 端口（可配置）启动 MJPEG 服务器，
    直接连接该端点即可获取实时屏幕流，无需额外子进程。

    性能优势：
    - 无子进程开销（go-ios screenshot --stream 需要独立进程）
    - 帧率稳定（WDA 内置控制，默认 10 FPS）
    - 延迟更低（减少一层代理）
    """

    def __init__(
        self,
        device_udid: str,
        wda_port: int = 8100,
        mjpeg_port: Optional[int] = None,
    ):
        """
        Args:
            device_udid: iOS 设备 UDID
            wda_port: WDA HTTP 端口（用于健康检查）
            mjpeg_port: WDA MJPEG 端口（默认 9100）
        """
        self.device_udid = device_udid
        self.wda_port = wda_port
        self.mjpeg_port = mjpeg_port or DEFAULT_WDA_MJPEG_PORT
        self._is_streaming = False

        logger.info(
            "iOS MJPEG stream manager initialized for device %s (WDA port: %d, MJPEG port: %d)",
            device_udid,
            self.wda_port,
            self.mjpeg_port,
        )

    def _is_port_open(self, port: int, timeout: float = 1.0) -> bool:
        """检查端口是否可连接"""
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=timeout):
                return True
        except (socket.timeout, ConnectionRefusedError, OSError):
            return False

    def _wait_for_mjpeg_ready(self, timeout: float = 5.0) -> bool:
        """等待 MJPEG 端口可用"""
        start = time.time()
        while time.time() - start < timeout:
            if self._is_port_open(self.mjpeg_port, timeout=0.5):
                return True
            time.sleep(0.2)
        return False

    def start_recording(self) -> bool:
        """
        标记 MJPEG 流已启动（WDA 的 MJPEG 服务器随 WDA 自动启动）

        Returns:
            bool: MJPEG 端口可用返回 True
        """
        if self._is_streaming:
            logger.debug("MJPEG stream already marked as active")
            return True

        # WDA 的 MJPEG 服务器随 WDA 启动，只需等待端口可用
        if self._wait_for_mjpeg_ready(timeout=5.0):
            self._is_streaming = True
            logger.info(
                "iOS MJPEG stream available at port %d (WDA native endpoint)",
                self.mjpeg_port,
            )
            return True

        logger.warning(
            "WDA MJPEG port %d not available, WDA may not be running or MJPEG disabled",
            self.mjpeg_port,
        )
        return False

    def stop_recording(self) -> bool:
        """
        标记 MJPEG 流已停止（实际由 WDA 生命周期管理）

        Returns:
            bool: 始终返回 True
        """
        self._is_streaming = False
        logger.info("iOS MJPEG stream marked as stopped")
        return True

    def get_mjpeg_url(self) -> str:
        """
        返回 WDA MJPEG 流 URL

        Returns:
            str: MJPEG 流 URL (http://127.0.0.1:9100)
        """
        return f"http://127.0.0.1:{self.mjpeg_port}"

    def is_stream_available(self) -> bool:
        """
        检查 MJPEG 流是否可用

        Returns:
            bool: WDA MJPEG 端口可连接返回 True
        """
        return self._is_port_open(self.mjpeg_port, timeout=0.5)

    def close(self):
        """清理资源（标记停止）"""
        self.stop_recording()
