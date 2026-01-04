#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Created on Fri Mar 01 2024 14:00:10 by codeskyblue
"""

import io
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from byteautoui import command_proxy
from byteautoui.command_types import Command, CurrentAppResponse, InstallAppRequest, InstallAppResponse, TapRequest
from byteautoui.model import DeviceInfo, Node, ShellResponse
from byteautoui.provider import BaseProvider

logger = logging.getLogger(__name__)


class IOSConfigRequest(BaseModel):
    """iOS设备配置请求"""
    wda_bundle_id: Optional[str] = None
    wda_port: Optional[int] = None


class IOSConfigResponse(BaseModel):
    """iOS设备配置响应"""
    wda_bundle_id: str
    wda_port: int


def make_router(provider: BaseProvider) -> APIRouter:
    router = APIRouter()

    @router.get("/list")
    def _list() -> List[DeviceInfo]:
        """List devices"""
        try:
            return provider.list_devices()
        except NotImplementedError as e:
            return Response(content="list_devices not implemented", media_type="text/plain", status_code=501)
        except Exception as e:
            logger.exception("list_devices failed")
            return Response(content=str(e), media_type="text/plain", status_code=500)

    @router.get(
        "/{serial}/screenshot/{id}",
        responses={200: {"content": {"image/jpeg": {}}}},
        response_class=Response,
    )
    def _screenshot(serial: str, id: int) -> Response:
        """Take a screenshot of device"""
        try:
            driver = provider.get_device_driver(serial)
            pil_img = driver.screenshot(id).convert("RGB")
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG")
            image_bytes = buf.getvalue()
            return Response(content=image_bytes, media_type="image/jpeg")
        except Exception as e:
            logger.exception("screenshot failed")
            return Response(content=str(e), media_type="text/plain", status_code=500)

    @router.get("/{serial}/hierarchy")
    def dump_hierarchy(serial: str, format: str = "json"):
        """Dump the view hierarchy of an Android device"""
        try:
            driver = provider.get_device_driver(serial)
            xml_data, hierarchy = driver.dump_hierarchy()
            if format == "xml":
                return Response(content=xml_data, media_type="text/xml")
            elif format == "json":
                # 获取屏幕尺寸并包装返回数据
                wsize = driver.window_size()
                return {
                    "key": hierarchy.key,
                    "name": hierarchy.name,
                    "bounds": hierarchy.bounds,
                    "rect": hierarchy.rect,
                    "properties": hierarchy.properties,
                    "children": hierarchy.children,
                    "width": wsize.width,
                    "height": wsize.height,
                }
            else:
                return Response(content=f"Invalid format: {format}", media_type="text/plain", status_code=400)
        except Exception as e:
            #logger.exception("dump_hierarchy failed")
            logger.error(f"Error dumping hierarchy: {str(e)}")
            return Response(content=str(e), media_type="text/plain", status_code=500)
    
    @router.post('/{serial}/command/tap')
    def command_tap(serial: str, params: TapRequest):
        """Run a command on the device"""
        driver = provider.get_device_driver(serial)
        command_proxy.tap(driver, params)
        return {"status": "ok"}
    
    @router.post('/{serial}/command/installApp')
    def install_app(serial: str, params: InstallAppRequest) -> InstallAppResponse:
        """Install app"""
        driver = provider.get_device_driver(serial)
        return command_proxy.app_install(driver, params)

    @router.get('/{serial}/command/currentApp')
    def current_app(serial: str) -> CurrentAppResponse:
        """Get current app"""
        driver = provider.get_device_driver(serial)
        return command_proxy.app_current(driver)

    @router.post('/{serial}/command/{command}')
    def _command_proxy_other(serial: str, command: Command, params: Dict[str, Any] = None):
        """Run a command on the device"""
        driver = provider.get_device_driver(serial)
        response = command_proxy.send_command(driver, command, params)
        return response
    
    @router.get('/{serial}/backupApp')
    def _backup_app(serial: str, packageName: str):
        """Backup app

        Added in 0.5.0
        """
        driver = provider.get_device_driver(serial)
        file_name = f"{packageName}.apk"
        headers = {
            'Content-Disposition': f'attachment; filename="{file_name}"'
        }
        return StreamingResponse(driver.open_app_file(packageName), headers=headers)

    # iOS特定路由 - 配置管理
    @router.get('/{serial}/ios-config')
    def get_ios_config(serial: str) -> IOSConfigResponse:
        """获取iOS设备的WDA配置"""
        try:
            from byteautoui.utils.ios_config import get_ios_config_manager
            config_manager = get_ios_config_manager()
            config = config_manager.get_device_config(serial)
            return IOSConfigResponse(
                wda_bundle_id=config['wda_bundle_id'],
                wda_port=config['wda_port']
            )
        except Exception as e:
            logger.exception("get_ios_config failed")
            return Response(content=str(e), media_type="text/plain", status_code=500)

    @router.post('/{serial}/ios-config')
    def set_ios_config(serial: str, config: IOSConfigRequest) -> IOSConfigResponse:
        """设置iOS设备的WDA配置"""
        try:
            from byteautoui.utils.ios_config import get_ios_config_manager
            config_manager = get_ios_config_manager()

            if config.wda_bundle_id:
                config_manager.set_wda_bundle_id(serial, config.wda_bundle_id)
            if config.wda_port:
                config_manager.set_wda_port(serial, config.wda_port)

            # 返回更新后的配置
            updated_config = config_manager.get_device_config(serial)
            return IOSConfigResponse(
                wda_bundle_id=updated_config['wda_bundle_id'],
                wda_port=updated_config['wda_port']
            )
        except Exception as e:
            logger.exception("set_ios_config failed")
            return Response(content=str(e), media_type="text/plain", status_code=500)

    return router
