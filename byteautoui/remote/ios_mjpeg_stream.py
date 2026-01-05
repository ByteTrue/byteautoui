#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""iOS MJPEG Stream Manager - 使用 WDA 原生 MJPEG 端点

WDA (WebDriverAgent) 内置 MJPEG 服务器，默认端口 9100。
通过 capabilities 或 /appium/settings 可配置帧率（默认配置 30 FPS）。

相比 go-ios screenshot --stream，WDA 原生 MJPEG 更高效稳定。

参考：https://github.com/appium/WebDriverAgent
"""

import errno
import logging
import socket
import time
from typing import Optional, TypedDict

logger = logging.getLogger(__name__)

# WDA MJPEG 默认端口（WebDriverAgent 内置）
DEFAULT_WDA_MJPEG_PORT = 9100


class WDAMJPEGSettings(TypedDict, total=False):
    """WDA MJPEG 服务端配置参数类型定义"""
    mjpegServerFramerate: int
    mjpegServerScreenshotQuality: int
    mjpegScalingFactor: int


# 默认的 WDA MJPEG 服务端调优参数（30fps，质量和缩放适中）
DEFAULT_WDA_MJPEG_SETTINGS: WDAMJPEGSettings = {
    "mjpegServerFramerate": 30,
    "mjpegServerScreenshotQuality": 50,
    "mjpegScalingFactor": 50,
}


def build_wda_mjpeg_settings(overrides: Optional[dict] = None) -> dict:
    """返回合并后的 MJPEG 配置，自动过滤 None 值。"""
    merged = DEFAULT_WDA_MJPEG_SETTINGS.copy()
    if overrides:
        for key, value in overrides.items():
            if value is None and key in merged:
                merged.pop(key, None)
            elif value is not None:
                merged[key] = value
    return {k: v for k, v in merged.items() if v is not None}


class IOSMJPEGStream:
    """
    iOS MJPEG 流管理（使用 WDA 原生 MJPEG 端点）

    WDA 启动时会在 9100 端口（可配置）启动 MJPEG 服务器，
    直接连接该端点即可获取实时屏幕流，无需额外子进程。

    性能优势：
    - 无子进程开销（go-ios screenshot --stream 需要独立进程）
    - 帧率可配置（通过 capabilities 或 /appium/settings 设置，默认 30 FPS）
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
        except socket.timeout:
            return False
        except ConnectionRefusedError:
            return False
        except OSError as e:
            # 仅处理网络相关的 OSError（如 ENETUNREACH, EHOSTUNREACH）
            if e.errno in (errno.ENETUNREACH, errno.EHOSTUNREACH, errno.ECONNRESET):
                return False
            # 其他 OSError 可能是系统级错误，记录日志后返回 False
            logger.debug("Unexpected OSError checking port %d: %s", port, e)
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
