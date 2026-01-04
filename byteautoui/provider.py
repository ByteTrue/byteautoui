#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Created on Sun Feb 18 2024 11:10:58 by codeskyblue
"""
from __future__ import annotations

import abc
import threading
from functools import lru_cache
from typing import Optional, Type

import adbutils

from byteautoui.driver.android import ADBAndroidDriver, U2AndroidDriver
from byteautoui.driver.base_driver import BaseDriver
from byteautoui.driver.harmony import HDC, HarmonyDriver
from byteautoui.driver.ios import IOSDriver
from byteautoui.exceptions import UiautoException
from byteautoui.model import DeviceInfo
from byteautoui.utils.usbmux import MuxDevice, list_devices


class BaseProvider(abc.ABC):
    @abc.abstractmethod
    def list_devices(self) -> list[DeviceInfo]:
        raise NotImplementedError()

    @abc.abstractmethod
    def get_device_driver(self, serial: str) -> BaseDriver:
        raise NotImplementedError()

    def get_single_device_driver(self) -> BaseDriver:
        """ debug use """
        devs = self.list_devices()
        if len(devs) == 0:
            raise UiautoException("No device found")
        if len(devs) > 1:
            raise UiautoException("More than one device found")
        return self.get_device_driver(devs[0].serial)


class AndroidProvider(BaseProvider):
    def __init__(self, driver_class: Type[BaseDriver] = U2AndroidDriver):
        self.driver_class = driver_class

    def list_devices(self) -> list[DeviceInfo]:
        adb = adbutils.AdbClient()
        ret: list[DeviceInfo] = []
        for d in adb.list(extended=True):
            if d.state != "device":
                ret.append(DeviceInfo(serial=d.serial, status=d.state, enabled=False))
            else:
                ret.append(DeviceInfo(
                    serial=d.serial,
                    status=d.state,
                    name=d.tags.get('device', ''),
                    model=d.tags.get('model', ''),
                    product=d.tags.get('product', ''),
                    enabled=True
                ))
        return ret

    @lru_cache
    def get_device_driver(self, serial: str) -> BaseDriver:
        return self.driver_class(serial)
        


class IOSProvider(BaseProvider):
    def __init__(self, wda_bundle_id: Optional[str] = None, wda_port: Optional[int] = None):
        """
        Args:
            wda_bundle_id: 全局默认的WDA bundle ID，会应用到所有设备（除非设备有自己的配置）
            wda_port: 全局默认的WDA端口
        """
        self.wda_bundle_id = wda_bundle_id
        self.wda_port = wda_port
        self._drivers: dict[str, IOSDriver] = {}
        self._driver_locks: dict[str, threading.Lock] = {}
        self._driver_locks_lock = threading.Lock()

    def list_devices(self) -> list[DeviceInfo]:
        devs = list_devices()
        return [DeviceInfo(serial=d.serial, model="unknown", name="unknown") for d in devs]

    def get_device_driver(self, serial: str) -> BaseDriver:
        driver = self._drivers.get(serial)
        if driver is not None:
            return driver
        with self._get_driver_lock(serial):
            driver = self._drivers.get(serial)
            if driver is not None:
                return driver
            driver = IOSDriver(
                serial=serial,
                wda_bundle_id=self.wda_bundle_id,
                wda_port=self.wda_port,
            )
            self._drivers[serial] = driver
            return driver

    def _get_driver_lock(self, serial: str) -> threading.Lock:
        with self._driver_locks_lock:
            lock = self._driver_locks.get(serial)
            if lock is None:
                lock = threading.Lock()
                self._driver_locks[serial] = lock
            return lock


class HarmonyProvider(BaseProvider):
    def __init__(self):
        super().__init__()
        self.hdc = HDC()

    def list_devices(self) -> list[DeviceInfo]:
        devices = self.hdc.list_device()
        return [DeviceInfo(serial=d, model=self.hdc.get_model(d), name=self.hdc.get_name(d)) for d in devices]

    @lru_cache
    def get_device_driver(self, serial: str) -> HarmonyDriver:
        return HarmonyDriver(self.hdc, serial)
