#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""断言功能单元测试"""

import base64
import io
from unittest.mock import MagicMock, Mock, patch

import pytest
from PIL import Image

from byteautoui.assertion import (
    execute_combined_assertion,
    execute_condition,
    validate_element_exists,
    validate_image_exists,
)
from byteautoui.command_types import AssertExpect, ElementSelector, ImageTemplate


# ============ 测试数据准备 ============

def create_test_xml():
    """创建测试用 XML 层级"""
    return """<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
    <node index="0" text="Login" resource-id="com.example:id/login_btn" class="android.widget.Button"
          package="com.example" bounds="[0,0][100,50]" />
    <node index="1" text="Password" resource-id="com.example:id/password" class="android.widget.EditText"
          package="com.example" bounds="[0,60][200,110]" />
    <node index="2" text="" resource-id="com.example:id/icon" class="android.widget.ImageView"
          package="com.example" bounds="[0,120][50,170]" />
</hierarchy>
"""


def create_test_image(width=100, height=100, color=(255, 0, 0)):
    """创建测试用 PIL 图片"""
    img = Image.new('RGB', (width, height), color)
    return img


def image_to_base64(img: Image.Image) -> str:
    """将 PIL 图片转换为 Base64 字符串"""
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    return f"data:image/png;base64,{b64}"


# ============ Element Validation Tests ============

def test_validate_element_xpath_found():
    """元素通过 XPath 找到 (成功)"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    selector = ElementSelector(xpath="//*[@resource-id='com.example:id/login_btn']")

    found, details = validate_element_exists(driver, selector, platform='android')

    assert found is True
    assert details['found_count'] == 1
    assert details['xpath'] == "//*[@resource-id='com.example:id/login_btn']"


def test_validate_element_xpath_not_found():
    """元素通过 XPath 未找到 (失败)"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    selector = ElementSelector(xpath="//*[@resource-id='com.example:id/nonexistent']")

    found, details = validate_element_exists(driver, selector, platform='android')

    assert found is False
    assert details['reason'] == "XPath 未找到元素"
    assert details['xpath'] == "//*[@resource-id='com.example:id/nonexistent']"


def test_validate_element_attribute_match():
    """元素找到且属性匹配 (成功)"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    selector = ElementSelector(
        xpath="//*[@resource-id='com.example:id/login_btn']",
        attributes={'text': 'Login', 'className': 'android.widget.Button'}
    )

    found, details = validate_element_exists(driver, selector, platform='android')

    assert found is True
    assert details['found_count'] == 1


def test_validate_element_attribute_mismatch():
    """元素找到但属性不匹配 (失败)"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    selector = ElementSelector(
        xpath="//*[@resource-id='com.example:id/login_btn']",
        attributes={'text': 'WrongText'}
    )

    found, details = validate_element_exists(driver, selector, platform='android')

    assert found is False
    assert details['reason'] == "找到元素但属性不匹配"
    assert details['found_count'] == 1


def test_validate_element_platform_ios():
    """iOS 平台属性映射"""
    ios_xml = """<?xml version="1.0" encoding="UTF-8"?>
<AppiumAUT>
    <XCUIElementTypeButton type="XCUIElementTypeButton" name="LoginBtn" label="Login"
                          enabled="true" visible="true" x="0" y="0" width="100" height="50" />
</AppiumAUT>
"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (ios_xml, None)

    # iOS 使用 label 而不是 text
    selector = ElementSelector(
        xpath="//XCUIElementTypeButton",
        attributes={'text': 'Login'}  # 前端传 text，后端映射为 label
    )

    found, details = validate_element_exists(driver, selector, platform='ios')

    assert found is True
    assert details['found_count'] == 1


def test_validate_element_invalid_xpath():
    """XPath 语法错误处理"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    selector = ElementSelector(xpath="//[@invalid syntax")

    found, details = validate_element_exists(driver, selector, platform='android')

    assert found is False
    assert 'XPath 语法错误' in details['reason']


def test_validate_element_skip_none_attributes():
    """跳过 None 属性值"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    selector = ElementSelector(
        xpath="//*[@resource-id='com.example:id/login_btn']",
        attributes={'text': 'Login', 'resourceId': None}  # None 应被跳过
    )

    found, details = validate_element_exists(driver, selector, platform='android')

    assert found is True


# ============ Image Matching Tests ============

@patch('byteautoui.assertion.cv2')
@patch('byteautoui.assertion.np')
def test_validate_image_high_confidence(mock_np, mock_cv2):
    """模板图片高置信度匹配 (成功)"""
    driver = MagicMock()
    screenshot_img = create_test_image(400, 400, (255, 0, 0))
    driver.screenshot.return_value = screenshot_img

    template_img = create_test_image(100, 100, (255, 0, 0))
    template_data = image_to_base64(template_img)

    # Mock numpy 数组
    import numpy as np
    mock_screenshot_array = np.zeros((400, 400, 3), dtype=np.uint8)
    mock_template_array = np.zeros((100, 100, 3), dtype=np.uint8)

    mock_np.array.side_effect = [mock_screenshot_array, mock_template_array]
    mock_cv2.cvtColor.side_effect = [mock_screenshot_array, mock_template_array]
    mock_cv2.COLOR_RGB2BGR = 4  # OpenCV constant

    # Mock OpenCV 返回高匹配度
    mock_cv2.matchTemplate.return_value = Mock()
    mock_cv2.minMaxLoc.return_value = (0.1, 0.95, (0, 0), (50, 50))

    template = ImageTemplate(data=template_data, threshold=0.9)

    found, details = validate_image_exists(driver, template)

    assert found is True
    assert details['max_confidence'] == 0.95
    assert details['threshold'] == 0.9
    assert details['location'] == (50, 50)


@patch('byteautoui.assertion.cv2')
@patch('byteautoui.assertion.np')
def test_validate_image_low_confidence(mock_np, mock_cv2):
    """模板图片低置信度不匹配 (失败)"""
    driver = MagicMock()
    screenshot_img = create_test_image(400, 400, (255, 0, 0))
    driver.screenshot.return_value = screenshot_img

    template_img = create_test_image(100, 100, (255, 0, 0))
    template_data = image_to_base64(template_img)

    # Mock numpy 数组
    import numpy as np
    mock_screenshot_array = np.zeros((400, 400, 3), dtype=np.uint8)
    mock_template_array = np.zeros((100, 100, 3), dtype=np.uint8)

    mock_np.array.side_effect = [mock_screenshot_array, mock_template_array]
    mock_cv2.cvtColor.side_effect = [mock_screenshot_array, mock_template_array]
    mock_cv2.COLOR_RGB2BGR = 4

    # Mock OpenCV 返回低匹配度
    mock_cv2.matchTemplate.return_value = Mock()
    mock_cv2.minMaxLoc.return_value = (0.1, 0.75, (0, 0), (50, 50))

    template = ImageTemplate(data=template_data, threshold=0.9)

    found, details = validate_image_exists(driver, template)

    assert found is False
    assert details['max_confidence'] == 0.75
    assert details['location'] is None


def test_validate_image_size_limit_exceeded():
    """模板图片超过大小限制 (失败)"""
    driver = MagicMock()
    driver.screenshot.return_value = create_test_image(400, 400)

    # 创建超大图片模拟超限 (>1MB)
    # 直接构造一个超大的 base64 字符串
    large_bytes = b'x' * (1024 * 1024 + 1)  # 1MB + 1 byte
    large_base64 = base64.b64encode(large_bytes).decode('utf-8')
    template_data = f"data:image/png;base64,{large_base64}"

    template = ImageTemplate(data=template_data, threshold=0.9)

    found, details = validate_image_exists(driver, template)

    assert found is False
    assert '模板图片过大' in details['reason']


@patch('byteautoui.assertion.cv2')
def test_validate_image_template_larger_than_screenshot(mock_cv2):
    """模板图片大于截图尺寸 (失败)"""
    driver = MagicMock()
    screenshot_img = create_test_image(100, 100)
    driver.screenshot.return_value = screenshot_img

    template_img = create_test_image(50, 50)
    template_data = image_to_base64(template_img)

    # Mock numpy 数组的 shape 属性
    import numpy as np
    mock_screenshot = np.zeros((100, 100, 3))
    mock_template = np.zeros((200, 200, 3))  # 模板更大

    mock_cv2.cvtColor.side_effect = [mock_screenshot, mock_template]

    template = ImageTemplate(data=template_data, threshold=0.9)

    found, details = validate_image_exists(driver, template)

    assert found is False
    assert '模板尺寸' in details['reason']
    assert '大于屏幕' in details['reason']


@patch('byteautoui.assertion.cv2')
@patch('byteautoui.assertion.np')
def test_validate_image_rgba_to_rgb_conversion(mock_np, mock_cv2):
    """RGBA 图片转换为 RGB"""
    driver = MagicMock()
    # 创建 RGBA 截图
    screenshot_img = Image.new('RGBA', (400, 400), (255, 0, 0, 255))
    driver.screenshot.return_value = screenshot_img

    # 创建 RGBA 模板
    template_img = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
    template_data = image_to_base64(template_img)

    # Mock numpy 数组
    import numpy as np
    mock_screenshot_array = np.zeros((400, 400, 3), dtype=np.uint8)
    mock_template_array = np.zeros((100, 100, 3), dtype=np.uint8)

    mock_np.array.side_effect = [mock_screenshot_array, mock_template_array]
    mock_cv2.cvtColor.side_effect = [mock_screenshot_array, mock_template_array]
    mock_cv2.COLOR_RGB2BGR = 4

    # Mock OpenCV
    mock_cv2.matchTemplate.return_value = Mock()
    mock_cv2.minMaxLoc.return_value = (0.1, 0.95, (0, 0), (50, 50))

    template = ImageTemplate(data=template_data, threshold=0.9)

    found, details = validate_image_exists(driver, template)

    # 验证 RGBA 被转换为 RGB（PIL 会自动转换）
    assert found is True


# ============ Combined Assertion Tests ============

def test_execute_condition_element_exists():
    """执行元素条件 - EXISTS 期望"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    condition = {
        'type': 'element',
        'selector': {
            'xpath': "//*[@resource-id='com.example:id/login_btn']",
            'attributes': None
        },
        'expect': 'exists'
    }

    success, details = execute_condition(driver, condition, platform='android')

    assert success is True
    assert details['found_count'] == 1


def test_execute_condition_element_not_exists():
    """执行元素条件 - NOT_EXISTS 期望"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    condition = {
        'type': 'element',
        'selector': {
            'xpath': "//*[@resource-id='com.example:id/nonexistent']",
            'attributes': None
        },
        'expect': 'not_exists'
    }

    success, details = execute_condition(driver, condition, platform='android')

    assert success is True  # 元素不存在，符合 NOT_EXISTS 期望


@patch('byteautoui.assertion.cv2')
@patch('byteautoui.assertion.np')
def test_execute_condition_image_exists(mock_np, mock_cv2):
    """执行图片条件 - EXISTS 期望"""
    driver = MagicMock()
    driver.screenshot.return_value = create_test_image(400, 400)

    template_data = image_to_base64(create_test_image(100, 100))

    # Mock numpy 数组
    import numpy as np
    mock_screenshot_array = np.zeros((400, 400, 3), dtype=np.uint8)
    mock_template_array = np.zeros((100, 100, 3), dtype=np.uint8)

    mock_np.array.side_effect = [mock_screenshot_array, mock_template_array]
    mock_cv2.cvtColor.side_effect = [mock_screenshot_array, mock_template_array]
    mock_cv2.COLOR_RGB2BGR = 4

    # Mock OpenCV 高匹配度
    mock_cv2.matchTemplate.return_value = Mock()
    mock_cv2.minMaxLoc.return_value = (0.1, 0.95, (0, 0), (50, 50))

    condition = {
        'type': 'image',
        'template': {
            'data': template_data,
            'threshold': 0.9,
            'name': None
        },
        'expect': 'exists'
    }

    success, details = execute_condition(driver, condition, platform='android')

    assert success is True


def test_execute_combined_and_all_success():
    """组合断言 AND 逻辑 - 所有条件成功"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/login_btn']"},
            'expect': 'exists'
        },
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/password']"},
            'expect': 'exists'
        }
    ]

    success, message, details = execute_combined_assertion(
        driver, 'and', conditions, wait_config=None, platform='android'
    )

    assert success is True
    assert message == "断言成功"
    assert details['operator'] == 'and'
    assert len(details['conditions']) == 2
    assert all(c['success'] for c in details['conditions'])


def test_execute_combined_and_one_failure():
    """组合断言 AND 逻辑 - 一个条件失败则整体失败"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/login_btn']"},
            'expect': 'exists'
        },
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/nonexistent']"},
            'expect': 'exists'
        }
    ]

    success, message, details = execute_combined_assertion(
        driver, 'and', conditions, wait_config=None, platform='android'
    )

    assert success is False
    assert message == "断言失败"
    assert details['conditions'][0]['success'] is True
    assert details['conditions'][1]['success'] is False


def test_execute_combined_or_any_success():
    """组合断言 OR 逻辑 - 任一条件成功"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/nonexistent']"},
            'expect': 'exists'
        },
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/login_btn']"},
            'expect': 'exists'
        }
    ]

    success, message, details = execute_combined_assertion(
        driver, 'or', conditions, wait_config=None, platform='android'
    )

    assert success is True
    assert message == "断言成功"
    assert details['operator'] == 'or'


def test_execute_combined_or_all_failure():
    """组合断言 OR 逻辑 - 所有条件失败"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/nonexistent1']"},
            'expect': 'exists'
        },
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/nonexistent2']"},
            'expect': 'exists'
        }
    ]

    success, message, details = execute_combined_assertion(
        driver, 'or', conditions, wait_config=None, platform='android'
    )

    assert success is False
    assert message == "断言失败"


def test_execute_combined_with_wait_success_immediately():
    """带等待的组合断言 - 立即成功无需重试"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/login_btn']"},
            'expect': 'exists'
        }
    ]

    wait_config = {'enabled': True, 'timeout': 3000, 'interval': 300}

    success, message, details = execute_combined_assertion(
        driver, 'and', conditions, wait_config, platform='android'
    )

    assert success is True
    assert details['attempts'] == 1


def test_execute_combined_with_wait_timeout():
    """带等待的组合断言 - 超时失败"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//*[@resource-id='com.example:id/nonexistent']"},
            'expect': 'exists'
        }
    ]

    wait_config = {'enabled': True, 'timeout': 500, 'interval': 100}

    success, message, details = execute_combined_assertion(
        driver, 'and', conditions, wait_config, platform='android'
    )

    assert success is False
    assert '断言超时失败' in message
    assert details['attempts'] > 1  # 应该至少重试了几次


def test_execute_combined_empty_conditions():
    """空条件列表直接返回成功"""
    driver = MagicMock()

    success, message, details = execute_combined_assertion(
        driver, 'and', [], wait_config=None, platform='android'
    )

    assert success is True
    assert message == "无断言条件"
    assert details['conditions'] == []


def test_execute_combined_invalid_operator():
    """无效的运算符抛出异常"""
    driver = MagicMock()

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//node"},
            'expect': 'exists'
        }
    ]

    with pytest.raises(ValueError, match="未知运算符"):
        execute_combined_assertion(driver, 'xor', conditions, None, platform='android')


def test_execute_combined_invalid_timeout():
    """无效的超时参数抛出异常"""
    driver = MagicMock()

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//node"},
            'expect': 'exists'
        }
    ]

    wait_config = {'enabled': True, 'timeout': -100, 'interval': 300}

    with pytest.raises(ValueError, match="timeout 必须为正数"):
        execute_combined_assertion(driver, 'and', conditions, wait_config, platform='android')


def test_execute_combined_invalid_interval():
    """无效的间隔参数抛出异常"""
    driver = MagicMock()

    conditions = [
        {
            'type': 'element',
            'selector': {'xpath': "//node"},
            'expect': 'exists'
        }
    ]

    wait_config = {'enabled': True, 'timeout': 3000, 'interval': 0}

    with pytest.raises(ValueError, match="interval 必须为正数"):
        execute_combined_assertion(driver, 'and', conditions, wait_config, platform='android')


def test_execute_condition_unknown_type():
    """未知条件类型抛出异常"""
    driver = MagicMock()

    condition = {
        'type': 'unknown',
        'expect': 'exists'
    }

    with pytest.raises(ValueError, match="未知条件类型"):
        execute_condition(driver, condition, platform='android')


# ============ Platform-Specific Attribute Mapping Tests ============

def test_platform_android_attribute_mapping():
    """Android 平台属性映射正确"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (create_test_xml(), None)

    selector = ElementSelector(
        xpath="//*[@resource-id='com.example:id/login_btn']",
        attributes={
            'text': 'Login',
            'resourceId': 'com.example:id/login_btn',
            'className': 'android.widget.Button'
        }
    )

    found, details = validate_element_exists(driver, selector, platform='android')

    assert found is True


def test_platform_harmony_attribute_mapping():
    """Harmony 平台属性映射"""
    harmony_xml = """<?xml version="1.0" encoding="UTF-8"?>
<hierarchy>
    <node text="Login" id="login_btn" type="Button" />
</hierarchy>
"""
    driver = MagicMock()
    driver.dump_hierarchy.return_value = (harmony_xml, None)

    selector = ElementSelector(
        xpath="//node[@id='login_btn']",
        attributes={'text': 'Login', 'className': 'Button'}
    )

    found, details = validate_element_exists(driver, selector, platform='harmony')

    assert found is True
