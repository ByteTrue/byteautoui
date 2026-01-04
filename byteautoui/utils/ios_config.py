#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""iOS设备配置管理 - 记忆WDA bundle ID等配置"""

import json
import logging
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class IOSConfigManager:
    """
    iOS设备配置管理器

    存储位置: ~/.byteautoui/ios_config.json
    存储内容:
    {
        "device_udid": {
            "wda_bundle_id": "com.facebook.WebDriverAgentRunner.xctrunner",
            "wda_port": 8100
        }
    }
    """

    DEFAULT_WDA_BUNDLE_ID = "com.facebook.WebDriverAgentRunner.xctrunner"
    DEFAULT_WDA_PORT = 8100

    def __init__(self, config_dir: Optional[Path] = None):
        """
        Args:
            config_dir: 配置目录，默认 ~/.byteautoui
        """
        if config_dir is None:
            config_dir = Path.home() / ".byteautoui"

        self.config_dir = config_dir
        self.config_file = config_dir / "ios_config.json"
        self._config: Dict = {}

        # 确保配置目录存在
        self.config_dir.mkdir(parents=True, exist_ok=True)

        # 加载配置
        self._load_config()

    def _load_config(self):
        """从文件加载配置"""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    self._config = json.load(f)
                logger.debug(f"Loaded iOS config from {self.config_file}")
            except Exception as e:
                logger.warning(f"Failed to load iOS config: {e}, using default")
                self._config = {}
        else:
            self._config = {}

    def _save_config(self):
        """保存配置到文件"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
            logger.debug(f"Saved iOS config to {self.config_file}")
        except Exception as e:
            logger.error(f"Failed to save iOS config: {e}")

    def get_wda_bundle_id(self, device_udid: str) -> str:
        """
        获取设备的WDA bundle ID

        Args:
            device_udid: 设备UDID

        Returns:
            WDA bundle ID，如果未配置则返回默认值
        """
        device_config = self._config.get(device_udid, {})
        bundle_id = device_config.get("wda_bundle_id", self.DEFAULT_WDA_BUNDLE_ID)
        logger.debug(f"Device {device_udid[:8]}... using WDA bundle ID: {bundle_id}")
        return bundle_id

    def set_wda_bundle_id(self, device_udid: str, bundle_id: str):
        """
        设置设备的WDA bundle ID（自动保存）

        Args:
            device_udid: 设备UDID
            bundle_id: WDA bundle ID
        """
        if device_udid not in self._config:
            self._config[device_udid] = {}

        self._config[device_udid]["wda_bundle_id"] = bundle_id
        self._save_config()
        logger.info(f"Saved WDA bundle ID for device {device_udid[:8]}...: {bundle_id}")

    def get_wda_port(self, device_udid: str) -> int:
        """获取设备的WDA端口"""
        device_config = self._config.get(device_udid, {})
        return device_config.get("wda_port", self.DEFAULT_WDA_PORT)

    def set_wda_port(self, device_udid: str, port: int):
        """设置设备的WDA端口（自动保存）"""
        if device_udid not in self._config:
            self._config[device_udid] = {}

        self._config[device_udid]["wda_port"] = port
        self._save_config()
        logger.info(f"Saved WDA port for device {device_udid[:8]}...: {port}")

    def get_device_config(self, device_udid: str) -> Dict:
        """
        获取设备的完整配置

        Returns:
            {
                "wda_bundle_id": str,
                "wda_port": int
            }
        """
        device_config = self._config.get(device_udid, {})
        return {
            "wda_bundle_id": device_config.get("wda_bundle_id", self.DEFAULT_WDA_BUNDLE_ID),
            "wda_port": device_config.get("wda_port", self.DEFAULT_WDA_PORT)
        }

    def clear_device_config(self, device_udid: str):
        """清除设备配置"""
        if device_udid in self._config:
            del self._config[device_udid]
            self._save_config()
            logger.info(f"Cleared config for device {device_udid[:8]}...")


# 全局单例
_config_manager: Optional[IOSConfigManager] = None


def get_ios_config_manager() -> IOSConfigManager:
    """获取全局配置管理器（单例）"""
    global _config_manager
    if _config_manager is None:
        _config_manager = IOSConfigManager()
    return _config_manager
