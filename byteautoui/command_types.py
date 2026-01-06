#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Created on Tue Mar 19 2024 10:19:27 by codeskyblue
"""


# Request and Response
import enum
from typing import List, Optional, Union

from pydantic import BaseModel

from byteautoui.model import Node


# POST /api/v1/device/{serial}/command/{command}
class Command(str, enum.Enum):
    TAP = "tap"
    TAP_ELEMENT = "tapElement"
    APP_INSTALL = "installApp"
    APP_CURRENT = "currentApp"
    APP_LAUNCH = "appLaunch"
    APP_TERMINATE = "appTerminate"
    APP_LIST = "appList"

    GET_WINDOW_SIZE = "getWindowSize"
    HOME = "home"
    DUMP = "dump"
    WAKE_UP = "wakeUp"
    FIND_ELEMENTS = "findElements"
    CLICK_ELEMENT = "clickElement"

    LIST = "list"

    # 0.4.0
    BACK = "back"
    APP_SWITCH = "appSwitch"
    VOLUME_UP = "volumeUp"
    VOLUME_DOWN = "volumeDown"
    VOLUME_MUTE = "volumeMute"
    SEND_KEYS = "sendKeys"
    CLEAR_TEXT = "clearText"
    SWIPE = "swipe"
    SWIPE_UP = "swipeUp"
    SWIPE_DOWN = "swipeDown"
    SWIPE_LEFT = "swipeLeft"
    SWIPE_RIGHT = "swipeRight"

    # iOS MJPEG 流控制
    START_MJPEG_STREAM = "start_mjpeg_stream"
    STOP_MJPEG_STREAM = "stop_mjpeg_stream"

    # 断言相关命令
    ASSERT_ELEMENT = "assertElement"
    ASSERT_IMAGE = "assertImage"
    ASSERT_COMBINED = "assertCombined"


class TapRequest(BaseModel):
    x: Union[int, float]
    y: Union[int, float]
    isPercent: bool = False


class InstallAppRequest(BaseModel):
    url: str


class InstallAppResponse(BaseModel):
    success: bool
    id: Optional[str] = None


class CurrentAppResponse(BaseModel):
    package: str
    activity: Optional[str] = None
    pid: Optional[int] = None


class AppLaunchRequest(BaseModel):
    package: str
    stop: bool = False


class AppTerminateRequest(BaseModel):
    package: str


class WindowSizeResponse(BaseModel):
    width: int
    height: int


class DumpResponse(BaseModel):
    value: str


class By(str, enum.Enum):
    ID = "id"
    TEXT = "text"
    LABEL = "label"
    XPATH = "xpath"
    CLASS_NAME = "className"

class FindElementRequest(BaseModel):
    by: By
    value: str
    timeout: float = 10.0


class FindElementResponse(BaseModel):
    count: int
    value: List[Node]


class SendKeysRequest(BaseModel):
    text: str


class SwipeRequest(BaseModel):
    startX: Union[int, float]
    startY: Union[int, float]
    endX: Union[int, float]
    endY: Union[int, float]
    duration: float = 0.5  # seconds


# ============ 断言相关类型定义 ============

class AssertExpect(str, enum.Enum):
    """断言期望结果"""
    EXISTS = "exists"
    NOT_EXISTS = "not_exists"


class ElementSelector(BaseModel):
    """元素选择器"""
    xpath: str
    attributes: Optional[dict] = None  # {text, resourceId, className}


class ElementCondition(BaseModel):
    """元素断言条件"""
    type: str = "element"
    selector: ElementSelector
    expect: AssertExpect


class ImageTemplate(BaseModel):
    """图片模板"""
    data: str           # Base64 编码的图片数据
    threshold: float = 0.9
    name: Optional[str] = None


class ImageCondition(BaseModel):
    """图片断言条件"""
    type: str = "image"
    template: ImageTemplate
    expect: AssertExpect


class WaitConfig(BaseModel):
    """等待配置"""
    enabled: bool = False
    timeout: int = 5000      # 毫秒
    interval: int = 500      # 毫秒


class AssertElementRequest(BaseModel):
    """元素断言请求"""
    selector: ElementSelector
    expect: AssertExpect
    wait: Optional[WaitConfig] = None
    platform: str = "android"  # 平台类型: "android" | "ios" | "harmony"


class AssertImageRequest(BaseModel):
    """图片断言请求"""
    template: ImageTemplate
    expect: AssertExpect
    wait: Optional[WaitConfig] = None
    platform: str = "android"  # 平台类型: "android" | "ios" | "harmony"


class AssertCombinedRequest(BaseModel):
    """组合断言请求"""
    operator: str  # "and" | "or"
    conditions: List[Union[ElementCondition, ImageCondition]]
    wait: Optional[WaitConfig] = None
    platform: str = "android"  # 平台类型: "android" | "ios" | "harmony"


class AssertResponse(BaseModel):
    """断言响应"""
    success: bool
    message: str
    screenshot: Optional[str] = None  # Base64 失败截图
    details: Optional[dict] = None    # 详细信息 (找到的元素、匹配度等)
