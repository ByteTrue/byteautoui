#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Created on Fri Mar 01 2024 14:19:29 by codeskyblue
"""

import base64
import io
import logging
import os
import re
import threading
import time
from typing import Optional, Tuple

import uiautomator2 as u2
from PIL import Image

from byteautoui.driver.android.adb_driver import ADBAndroidDriver
from byteautoui.driver.android.common import parse_xml
from byteautoui.exceptions import AndroidDriverException
from byteautoui.model import AppInfo, Node, WindowSize

logger = logging.getLogger(__name__)

_DEFAULT_U2_RPC_TIMEOUT = 15.0  # seconds, fail fast for interactive UI
_U2_RPC_TIMEOUT_ENV = "UIAUTODEV_ANDROID_U2_RPC_TIMEOUT"


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Invalid %s=%r, fallback to %s", name, raw, default)
        return default
    if value <= 0:
        logger.warning("Invalid %s=%r (<=0), fallback to %s", name, raw, default)
        return default
    return value


class U2AndroidDriver(ADBAndroidDriver):
    def __init__(self, serial: str):
        super().__init__(serial)
        self._ud_lock = threading.Lock()
        self._ud: Optional[u2.Device] = None

    @property
    def ud(self) -> u2.Device:
        # cached_property is not thread-safe; initial page load triggers
        # screenshot + hierarchy concurrently, so guard init with a lock.
        if self._ud is not None:
            return self._ud
        with self._ud_lock:
            if self._ud is None:
                self._ud = u2.connect_usb(self.serial)
            return self._ud

    def _invalidate_ud(self):
        with self._ud_lock:
            self._ud = None
    
    def screenshot(self, id: int) -> Image.Image:
        if id > 0:
            # u2 is not support multi-display yet
            return super().screenshot(id)

        # Initial page load should not block on uiautomator2 init. If ud is not
        # ready yet, fallback to adb screenshot immediately.
        if self._ud is None:
            return super().screenshot(id)

        timeout = _env_float(_U2_RPC_TIMEOUT_ENV, _DEFAULT_U2_RPC_TIMEOUT)
        try:
            # uiautomator2 默认 300s 超时（HTTP_TIMEOUT），这里必须失败快。
            base64_data = self.ud.jsonrpc.takeScreenshot(1, 80, http_timeout=timeout)
            if base64_data:
                jpg_raw = base64.b64decode(base64_data)
                return Image.open(io.BytesIO(jpg_raw))
        except Exception as e:
            logger.warning("u2 screenshot failed, fallback to adb: %s", e)
            # Connection can get into a bad state after timeout; force reconnect next time.
            self._invalidate_ud()

        return super().screenshot(id)

    def dump_hierarchy(self, display_id: Optional[int] = 0) -> Tuple[str, Node]:
        """returns xml string and hierarchy object"""
        start = time.time()
        xml_data = self._dump_hierarchy_raw()
        logger.debug("dump_hierarchy cost: %s", time.time() - start)

        wsize = self.adb_device.window_size()
        logger.debug("window size: %s", wsize)
        return xml_data, parse_xml(
            xml_data, WindowSize(width=wsize[0], height=wsize[1]), display_id
        )

    def _dump_hierarchy_raw(self) -> str:
        """
        uiautomator2 server is conflict with "uiautomator dump" command.

        uiautomator dump errors:
        - ERROR: could not get idle state.
        """
        # Initial page load should not block on uiautomator2 init. If ud is not
        # ready yet, fallback to adb hierarchy dump immediately.
        if self._ud is None:
            return super()._dump_hierarchy_raw()

        try:
            timeout = _env_float(_U2_RPC_TIMEOUT_ENV, _DEFAULT_U2_RPC_TIMEOUT)
            max_depth = None
            try:
                max_depth = self.ud.settings.get("max_depth")  # type: ignore[attr-defined]
            except Exception:
                max_depth = None
            if not isinstance(max_depth, int) or max_depth <= 0:
                max_depth = 50

            # Avoid uiautomator2 default 300s HTTP_TIMEOUT
            content = self.ud.jsonrpc.dumpWindowHierarchy(False, max_depth, http_timeout=timeout)
            if not content:
                raise AndroidDriverException("Failed to dump hierarchy: empty result")
            return content
        except Exception as e:
            logger.warning("u2 dump_hierarchy failed, fallback to adb: %s", e)
            self._invalidate_ud()
            # Fallback to adb-based hierarchy dump (works even when u2 server is stuck)
            return super()._dump_hierarchy_raw()
    
    def tap(self, x: int, y: int):
        self.ud.click(x, y)
    
    def send_keys(self, text: str):
        self.ud.send_keys(text)
    
    def clear_text(self):
        self.ud.clear_text()

    def swipe(self, start_x: int, start_y: int, end_x: int, end_y: int, duration: float = 0.5):
        """Swipe from (start_x, start_y) to (end_x, end_y)"""
        self.ud.swipe(start_x, start_y, end_x, end_y, duration)
