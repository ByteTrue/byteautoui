#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Created on Tue Mar 19 2024 10:43:51 by codeskyblue
"""

from __future__ import annotations

import time
import typing
from typing import Callable, Dict, List, Optional, Union

from lxml import etree
from pydantic import BaseModel

from byteautoui.command_types import AppLaunchRequest, AppTerminateRequest, By, Command, CurrentAppResponse, \
    DumpResponse, FindElementRequest, FindElementResponse, InstallAppRequest, InstallAppResponse, SendKeysRequest, \
    SwipeRequest, TapRequest, WindowSizeResponse
from byteautoui.driver.base_driver import BaseDriver
from byteautoui.exceptions import ElementNotFoundError
from byteautoui.model import AppInfo, Node
from byteautoui.utils.common import node_travel

COMMANDS: Dict[Command, Callable] = {}


def register(command: Command):
    def wrapper(func):
        COMMANDS[command] = func
        return func

    return wrapper


def get_command_params_type(command: Command) -> Optional[BaseModel]:
    func = COMMANDS.get(command)
    if func is None:
        return None
    type_hints = typing.get_type_hints(func)
    return type_hints.get("params")


def send_command(driver: BaseDriver, command: Command, params=None):
    if command not in COMMANDS:
        raise NotImplementedError(f"command {command} not implemented")
    func = COMMANDS[command]
    params_model = get_command_params_type(command)
    if params_model:
        if params is None:
            raise ValueError(f"params is required for {command}")
        if isinstance(params, dict):
            params = params_model.model_validate(params)
        elif isinstance(params, params_model):
            pass
        else:
            raise TypeError(f"params should be {params_model}", params)
    if not params:
        return func(driver)
    return func(driver, params)


@register(Command.TAP)
def tap(driver: BaseDriver, params: TapRequest):
    """Tap on the screen
    """
    x = params.x
    y = params.y
    if params.isPercent:
        wsize = driver.window_size()
        x = int(wsize[0] * params.x)
        y = int(wsize[1] * params.y)
    driver.tap(int(x), int(y))


@register(Command.APP_INSTALL)
def app_install(driver: BaseDriver, params: InstallAppRequest):
    """install app"""
    driver.app_install(params.url)
    return InstallAppResponse(success=True, id=None)


@register(Command.APP_CURRENT)
def app_current(driver: BaseDriver) -> CurrentAppResponse:
    """get current app"""
    return driver.app_current()


@register(Command.APP_LAUNCH)
def app_launch(driver: BaseDriver, params: AppLaunchRequest):
    if params.stop:
        driver.app_terminate(params.package)
    driver.app_launch(params.package)


@register(Command.APP_TERMINATE)
def app_terminate(driver: BaseDriver, params: AppTerminateRequest):
    driver.app_terminate(params.package)


@register(Command.GET_WINDOW_SIZE)
def window_size(driver: BaseDriver) -> WindowSizeResponse:
    wsize = driver.window_size()
    return WindowSizeResponse(width=wsize[0], height=wsize[1])


@register(Command.HOME)
def home(driver: BaseDriver):
    driver.home()


@register(Command.BACK)
def back(driver: BaseDriver):
    driver.back()


@register(Command.APP_SWITCH)
def app_switch(driver: BaseDriver):
    driver.app_switch()


@register(Command.VOLUME_UP)
def volume_up(driver: BaseDriver):
    driver.volume_up()


@register(Command.VOLUME_DOWN)
def volume_down(driver: BaseDriver):
    driver.volume_down()


@register(Command.VOLUME_MUTE)
def volume_mute(driver: BaseDriver):
    driver.volume_mute()


@register(Command.DUMP)
def dump(driver: BaseDriver) -> DumpResponse:
    source, _ = driver.dump_hierarchy()
    return DumpResponse(value=source)


@register(Command.WAKE_UP)
def wake_up(driver: BaseDriver):
    driver.wake_up()

@register(Command.SEND_KEYS)
def send_keys(driver: BaseDriver, params: SendKeysRequest):
    driver.send_keys(params.text)

@register(Command.CLEAR_TEXT)
def clear_text(driver: BaseDriver):
    driver.clear_text()


@register(Command.SWIPE)
def swipe(driver: BaseDriver, params: SwipeRequest):
    """Swipe on the screen"""
    driver.swipe(
        int(params.startX), int(params.startY),
        int(params.endX), int(params.endY),
        params.duration
    )


@register(Command.SWIPE_UP)
def swipe_up(driver: BaseDriver):
    """Swipe up (from bottom to top)"""
    wsize = driver.window_size()
    width, height = wsize[0], wsize[1]
    # 从屏幕底部中央向上滑动到顶部
    driver.swipe(width // 2, height * 4 // 5, width // 2, height // 5, 0.3)


@register(Command.SWIPE_DOWN)
def swipe_down(driver: BaseDriver):
    """Swipe down (from top to bottom)"""
    wsize = driver.window_size()
    width, height = wsize[0], wsize[1]
    # 从屏幕顶部中央向下滑动到底部
    driver.swipe(width // 2, height // 5, width // 2, height * 4 // 5, 0.3)


@register(Command.SWIPE_LEFT)
def swipe_left(driver: BaseDriver):
    """Swipe left (from right to left)"""
    wsize = driver.window_size()
    width, height = wsize[0], wsize[1]
    # 从屏幕右侧中央向左滑动到左侧
    driver.swipe(width * 4 // 5, height // 2, width // 5, height // 2, 0.3)


@register(Command.SWIPE_RIGHT)
def swipe_right(driver: BaseDriver):
    """Swipe right (from left to right)"""
    wsize = driver.window_size()
    width, height = wsize[0], wsize[1]
    # 从屏幕左侧中央向右滑动到右侧
    driver.swipe(width // 5, height // 2, width * 4 // 5, height // 2, 0.3)


def node_match(node: Node, by: By, value: str) -> bool:
    if by == By.ID:
        return node.properties.get("resource-id") == value or node.properties.get("label") == value
    if by == By.TEXT:
        return node.properties.get("text") == value or node.properties.get("label") == value
    if by == By.LABEL:
        return node.properties.get("label") == value
    if by == By.CLASS_NAME:
        return node.name == value
    # XPath is handled separately in find_elements()
    if by == By.XPATH:
        raise ValueError("XPath matching should be done via find_elements() with XML parsing")
    raise ValueError(f"not support by {by!r}")


def _xml_element_to_node(element: etree._Element, parent_path: str = "") -> Node:
    """Convert lxml Element to Node object"""
    properties = dict(element.attrib)

    # Generate unique key based on tag and position
    index = properties.get("index", "0")
    resource_id = properties.get("resource-id", "")
    if resource_id:
        # Use resource-id if available
        key = f"{parent_path}/{resource_id}"
    else:
        # Otherwise use tag and index
        key = f"{parent_path}/{element.tag}[{index}]"

    # Parse bounds: "[x1,y1][x2,y2]" -> [x1, y1, x2, y2]
    bounds_str = properties.get("bounds", "")
    bounds = None
    if bounds_str:
        try:
            # Extract numbers from "[x1,y1][x2,y2]" format
            import re
            numbers = re.findall(r'\d+', bounds_str)
            if len(numbers) == 4:
                bounds = [int(n) for n in numbers]
        except:
            pass

    # Create Node object
    node = Node(
        key=key,
        name=element.tag,
        properties=properties,
        bounds=bounds,
        children=[_xml_element_to_node(child, key) for child in element]
    )

    return node


@register(Command.FIND_ELEMENTS)
def find_elements(driver: BaseDriver, params: FindElementRequest) -> FindElementResponse:
    source, root_node = driver.dump_hierarchy()

    # Handle XPath queries via lxml
    if params.by == By.XPATH:
        try:
            # Parse XML
            root = etree.fromstring(source.encode('utf-8'))

            # Execute XPath query
            elements = root.xpath(params.value)

            # Convert lxml Elements to Node objects
            nodes = []
            for elem in elements:
                if isinstance(elem, etree._Element):
                    node = _xml_element_to_node(elem)
                    nodes.append(node)

            return FindElementResponse(count=len(nodes), value=nodes)
        except etree.XPathEvalError as e:
            raise ValueError(f"Invalid XPath expression: {e}")
        except Exception as e:
            raise ValueError(f"XPath query failed: {e}")

    # Handle non-XPath queries (ID, TEXT, CLASS_NAME)
    nodes = []
    for node in node_travel(root_node):
        if node_match(node, params.by, params.value):
            nodes.append(node)
    return FindElementResponse(count=len(nodes), value=nodes)


@register(Command.CLICK_ELEMENT)
def click_element(driver: BaseDriver, params: FindElementRequest):
    node = None
    deadline = time.time() + params.timeout
    while time.time() < deadline:
        result = find_elements(driver, params)
        if result.value:
            node = result.value[0]
            break
        time.sleep(.5) # interval
    if not node:
        raise ElementNotFoundError(f"element not found by {params.by}={params.value}")
    center_x = (node.bounds[0] + node.bounds[2]) / 2
    center_y = (node.bounds[1] + node.bounds[3]) / 2
    tap(driver, TapRequest(x=center_x, y=center_y, isPercent=True))


@register(Command.APP_LIST)
def app_list(driver: BaseDriver) -> List[AppInfo]:
    # added in v0.5.0
    return driver.app_list()
