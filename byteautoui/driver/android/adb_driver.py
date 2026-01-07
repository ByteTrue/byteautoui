#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Created on Fri Mar 01 2024 14:19:29 by codeskyblue
"""

import logging
import io
import os
import re
import time
from typing import Iterator, List, Optional, Tuple

import adbutils
from PIL import Image

from byteautoui.command_types import CurrentAppResponse
from byteautoui.driver.android.common import parse_xml
from byteautoui.driver.base_driver import BaseDriver
from byteautoui.exceptions import AndroidDriverException
from byteautoui.model import AppInfo, Node, Rect, ShellResponse, WindowSize

logger = logging.getLogger(__name__)

_DEFAULT_ANDROID_SCREENSHOT_TIMEOUT = 15.0  # seconds, fail fast for UI
_DEFAULT_ANDROID_HIERARCHY_TIMEOUT = 20.0  # seconds, fail fast for UI
_SCREENSHOT_TIMEOUT_ENV = "UIAUTODEV_ANDROID_SCREENSHOT_TIMEOUT"
_HIERARCHY_TIMEOUT_ENV = "UIAUTODEV_ANDROID_HIERARCHY_TIMEOUT"


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


class ADBAndroidDriver(BaseDriver):
    def __init__(self, serial: str):
        super().__init__(serial)
        self.adb_device = adbutils.device(serial)

    def get_current_activity(self) -> str:
        ret = self.adb_device.shell2(["dumpsys", "activity", "activities"], rstrip=True, timeout=5)
        # 使用正则查找包含前台 activity 的行
        match = re.search(r"mResumedActivity:.*? ([\w\.]+\/[\w\.]+)", ret.output)
        if match:
            return match.group(1)  # 返回包名/类名，例如 com.example/.MainActivity
        else:
            return ""
    
    def screenshot(self, id: int) -> Image.Image:
        if id > 0:
            raise AndroidDriverException("multi-display is not supported yet for uiautomator2")

        timeout = _env_float(_SCREENSHOT_TIMEOUT_ENV, _DEFAULT_ANDROID_SCREENSHOT_TIMEOUT)
        try:
            png_bytes = self.adb_device.shell(["screencap", "-p"], encoding=None, timeout=timeout)
            pil_img = Image.open(io.BytesIO(png_bytes))
            return pil_img
        except Exception as e:
            logger.warning("adb screencap failed, fallback to adbutils screenshot: %s", e)
            return self.adb_device.screenshot(display_id=id)

    def shell(self, command: str) -> ShellResponse:
        try:
            ret = self.adb_device.shell2(command, rstrip=True, timeout=20)
            if ret.returncode == 0:
                return ShellResponse(output=ret.output, error=None)
            else:
                return ShellResponse(
                    output="", error=f"exit:{ret.returncode}, output:{ret.output}"
                )
        except Exception as e:
            return ShellResponse(output="", error=f"adb error: {str(e)}")

    def dump_hierarchy(self, display_id: Optional[int] = 0) -> Tuple[str, Node]:
        """returns xml string and hierarchy object"""
        start = time.time()
        try:
            xml_data = self._dump_hierarchy_raw()
            logger.debug("dump_hierarchy cost: %s", time.time() - start)
        except Exception as e:
            raise AndroidDriverException(f"Failed to dump hierarchy: {str(e)}")

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
        timeout = _env_float(_HIERARCHY_TIMEOUT_ENV, _DEFAULT_ANDROID_HIERARCHY_TIMEOUT)
        target = "/data/local/tmp/uidump.xml"
        cmd = f"rm -f {target}; uiautomator dump {target} && echo success"

        last_error: Exception = RuntimeError("unreachable")
        for attempt in range(2):
            try:
                output = self.adb_device.shell(cmd, timeout=timeout)
                if "ERROR" in output or "success" not in output:
                    raise adbutils.AdbError("uiautomator dump failed", output)

                buf = b"".join(self.adb_device.sync.iter_content(target))
                xml_data = buf.decode("utf-8", errors="replace")
                if not xml_data.startswith("<?xml"):
                    raise adbutils.AdbError("dump output is not xml", xml_data[:200])
                return xml_data
            except adbutils.AdbError as e:
                last_error = e
                # When uiautomator2 server is running, uiautomator dump may be killed.
                if attempt == 0 and "Killed" in str(e):
                    self.kill_app_process()
                    continue
                raise
            except Exception as e:
                last_error = e
                raise

        raise adbutils.AdbError(f"dump_hierarchy failed: {last_error}")
    
    def kill_app_process(self):
        logger.debug("Killing app_process")
        pids = []
        for line in self.adb_device.shell("ps -A || ps").splitlines():
            if "app_process" in line:
                fields = line.split()
                if len(fields) >= 2:
                    pids.append(int(fields[1]))
                    logger.debug(f"App process PID: {fields[1]}")
        for pid in set(pids):
            self.adb_device.shell(f"kill {pid}")

    def tap(self, x: int, y: int):
        self.adb_device.click(x, y)

    def window_size(self) -> WindowSize:
        w, h = self.adb_device.window_size()
        return WindowSize(width=w, height=h)

    def app_install(self, app_path: str):
        self.adb_device.install(app_path)

    def app_current(self) -> CurrentAppResponse:
        info = self.adb_device.app_current()
        return CurrentAppResponse(
            package=info.package, activity=info.activity, pid=info.pid
        )

    def app_launch(self, package: str):
        if self.adb_device.package_info(package) is None:
            raise AndroidDriverException(f"App not installed: {package}")
        self.adb_device.app_start(package)
    
    def app_terminate(self, package: str):
        self.adb_device.app_stop(package)

    def home(self):
        self.adb_device.keyevent("HOME")
    
    def wake_up(self):
        self.adb_device.keyevent("WAKEUP")
    
    def back(self):
        self.adb_device.keyevent("BACK")
    
    def app_switch(self):
        self.adb_device.keyevent("APP_SWITCH")
    
    def volume_up(self):
        self.adb_device.keyevent("VOLUME_UP")
    
    def volume_down(self):
        self.adb_device.keyevent("VOLUME_DOWN")
    
    def volume_mute(self):
        self.adb_device.keyevent("VOLUME_MUTE")

    def get_app_version(self, package_name: str) -> dict:
        """
        Get the version information of an app, including mainVersion and subVersion.

        Args:
            package_name (str): The package name of the app.

        Returns:
            dict: A dictionary containing mainVersion and subVersion.
        """
        output = self.adb_device.shell(["dumpsys", "package", package_name])

        # versionName
        m = re.search(r"versionName=(?P<name>[^\s]+)", output)
        version_name = m.group("name") if m else ""
        if version_name == "null":  # Java dumps "null" for null values
            version_name = None

        # versionCode
        m = re.search(r"versionCode=(?P<code>\d+)", output)
        version_code = m.group("code") if m else ""
        version_code = int(version_code) if version_code.isdigit() else None

        return {
            "versionName": version_name,
            "versionCode": version_code
        }

    def app_list(self) -> List[AppInfo]:
        results = []
        output = self.adb_device.shell(["pm", "list", "packages", '-3'])
        for m in re.finditer(r"^package:([^\s]+)\r?$", output, re.M):
            packageName = m.group(1)
            # get version
            version_info = self.get_app_version(packageName)
            app_info = AppInfo(
                packageName=packageName,
                versionName=version_info.get("versionName"),
                versionCode=version_info.get("versionCode")
            )
            results.append(app_info)
        return results

    def open_app_file(self, package: str) -> Iterator[bytes]:
        line = self.adb_device.shell(f"pm path {package}")
        assert isinstance(line, str)
        if not line.startswith("package:"):
            raise AndroidDriverException(f"Failed to get package path: {line}")
        remote_path = line.split(':', 1)[1]
        yield from self.adb_device.sync.iter_content(remote_path)
    
    def send_keys(self, text: str):
        self.adb_device.send_keys(text)
    
    def clear_text(self):
        for _ in range(3):
            self.adb_device.shell2("input keyevent DEL --longpress")
