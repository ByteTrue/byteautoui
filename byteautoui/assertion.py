#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""断言服务 - 元素和图片验证逻辑"""

import base64
import io
import logging
import time
from typing import Optional, Tuple

import cv2
import numpy as np
from lxml import etree
from PIL import Image

from byteautoui.command_types import (
    AssertExpect,
    ElementSelector,
    ImageTemplate,
)
from byteautoui.constants import MAX_TEMPLATE_SIZE
from byteautoui.driver.base_driver import BaseDriver

logger = logging.getLogger(__name__)

# 平台感知的属性映射
# 前端使用 camelCase，各平台 XML 属性名不同
PLATFORM_ATTR_MAPPING = {
    'android': {
        'text': 'text',
        'resourceId': 'resource-id',
        'className': 'class',
    },
    'ios': {
        'text': 'label',
        'resourceId': 'name',
        'className': 'type',
    },
    'harmony': {
        'text': 'text',
        'resourceId': 'id',
        'className': 'type',
    },
}


def validate_element_exists(
    driver: BaseDriver,
    selector: ElementSelector,
    platform: str = 'android'
) -> Tuple[bool, Optional[dict]]:
    """
    验证元素是否存在

    Args:
        driver: 设备驱动
        selector: 元素选择器
        platform: 平台类型 ('android', 'ios', 'harmony')

    Returns:
        (found: bool, details: dict | None)
    """
    try:
        # 获取 UI 层级
        xml_source, _ = driver.dump_hierarchy()
        root = etree.fromstring(xml_source.encode('utf-8'))

        # XPath 查询
        elements = root.xpath(selector.xpath)

        if not elements:
            return False, {"reason": "XPath 未找到元素", "xpath": selector.xpath}

        # 如果指定了属性，需要额外验证
        if selector.attributes:
            # 获取平台对应的属性映射，默认使用 android
            attr_mapping = PLATFORM_ATTR_MAPPING.get(platform, PLATFORM_ATTR_MAPPING['android'])

            matched = False
            for elem in elements:
                if not isinstance(elem, etree._Element):
                    continue

                # 检查所有指定的属性
                all_match = True
                for attr_key, attr_value in selector.attributes.items():
                    if attr_value is None:
                        continue  # 跳过未指定的属性

                    # 使用平台感知的属性映射
                    xml_attr = attr_mapping.get(attr_key)
                    if not xml_attr:
                        logger.warning(f"未知属性 {attr_key} (平台: {platform})")
                        continue  # 跳过未知属性

                    elem_value = elem.get(xml_attr, '')
                    if elem_value != attr_value:
                        all_match = False
                        break

                if all_match:
                    matched = True
                    break

            if not matched:
                return False, {
                    "reason": "找到元素但属性不匹配",
                    "found_count": len(elements),
                    "xpath": selector.xpath,
                }

        # 元素找到且属性匹配
        return True, {
            "found_count": len(elements),
            "xpath": selector.xpath,
        }

    except etree.XPathError as e:
        logger.error(f"XPath 语法错误 (xpath={selector.xpath}): {e}")
        return False, {"reason": f"XPath 语法错误: {str(e)}", "xpath": selector.xpath}
    except Exception as e:
        logger.error(f"元素验证失败 (xpath={selector.xpath}): {e}", exc_info=True)
        return False, {
            "reason": f"验证异常: {str(e)}",
            "xpath": selector.xpath
        }


def validate_image_exists(
    driver: BaseDriver,
    template: ImageTemplate
) -> Tuple[bool, Optional[dict]]:
    """
    验证图片模板是否存在于当前屏幕

    Returns:
        (found: bool, details: dict | None)
    """
    try:
        # 获取当前屏幕截图并统一转换为 RGB
        screenshot_pil = driver.screenshot(0)
        if screenshot_pil.mode != 'RGB':
            screenshot_pil = screenshot_pil.convert('RGB')

        # PIL Image 转 OpenCV 格式 (RGB -> BGR)
        screenshot_cv = cv2.cvtColor(np.array(screenshot_pil), cv2.COLOR_RGB2BGR)

        # 解析 Base64 模板图片
        # 格式: data:image/png;base64,iVBORw0KG...
        if template.data.startswith('data:'):
            base64_data = template.data.split(',', 1)[1]
        else:
            base64_data = template.data

        template_bytes = base64.b64decode(base64_data)

        # 检查模板大小限制
        if len(template_bytes) > MAX_TEMPLATE_SIZE:
            return False, {
                "reason": f"模板图片过大: {len(template_bytes) / 1024:.1f}KB (上限 {MAX_TEMPLATE_SIZE / 1024}KB)"
            }

        # 解析并统一转换为 RGB
        template_pil = Image.open(io.BytesIO(template_bytes))
        if template_pil.mode != 'RGB':
            template_pil = template_pil.convert('RGB')

        template_cv = cv2.cvtColor(np.array(template_pil), cv2.COLOR_RGB2BGR)

        # 检查模板尺寸是否大于截图
        if template_cv.shape[0] > screenshot_cv.shape[0] or template_cv.shape[1] > screenshot_cv.shape[1]:
            return False, {
                "reason": f"模板尺寸 ({template_cv.shape[1]}x{template_cv.shape[0]}) 大于屏幕 ({screenshot_cv.shape[1]}x{screenshot_cv.shape[0]})"
            }

        # 模板匹配
        result = cv2.matchTemplate(screenshot_cv, template_cv, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)

        logger.info(f"模板匹配结果: max_val={max_val:.3f}, threshold={template.threshold}")

        found = max_val >= template.threshold

        details = {
            "max_confidence": float(max_val),
            "threshold": template.threshold,
            "location": max_loc if found else None,
            "template_size": f"{template_cv.shape[1]}x{template_cv.shape[0]}",
        }

        return found, details

    except Exception as e:
        logger.error(f"图片验证失败: {e}", exc_info=True)
        return False, {"reason": f"验证异常: {str(e)}"}


def execute_condition(
    driver: BaseDriver,
    condition: dict,
    platform: str = 'android'
) -> Tuple[bool, Optional[dict]]:
    """
    执行单个断言条件

    Args:
        driver: 设备驱动
        condition: 条件字典 (ElementCondition 或 ImageCondition)
        platform: 平台类型 ('android', 'ios', 'harmony')

    Returns:
        (success: bool, details: dict | None)
    """
    cond_type = condition.get('type')
    expect_raw = condition.get('expect')
    expect = AssertExpect(expect_raw)

    if cond_type == 'element':
        # 元素断言
        selector_data = condition.get('selector')
        selector = ElementSelector(**selector_data)

        found, details = validate_element_exists(driver, selector, platform)

        # 根据 expect 判断成功/失败
        success = found if expect == AssertExpect.EXISTS else not found

        return success, details

    elif cond_type == 'image':
        # 图片断言
        template_data = condition.get('template')
        template = ImageTemplate(**template_data)

        found, details = validate_image_exists(driver, template)

        # 根据 expect 判断成功/失败
        success = found if expect == AssertExpect.EXISTS else not found

        return success, details

    else:
        raise ValueError(f"未知条件类型: {cond_type}")


def execute_combined_assertion(
    driver: BaseDriver,
    operator: str,
    conditions: list,
    wait_config: Optional[dict] = None,
    platform: str = 'android'
) -> Tuple[bool, str, Optional[dict]]:
    """
    执行组合断言（带等待重试）

    Args:
        driver: 设备驱动
        operator: "and" | "or"
        conditions: 条件列表
        wait_config: 等待配置 {enabled, timeout, interval}
        platform: 平台类型 ('android', 'ios', 'harmony')

    Returns:
        (success: bool, message: str, details: dict | None)
    """
    # 验证 operator
    if operator not in ('and', 'or'):
        raise ValueError(f"未知运算符: {operator}，仅支持 'and' 或 'or'")

    # 验证 conditions（理论上 Pydantic 已经验证过，这里是双重保险）
    if not conditions:
        raise AssertionError(
            "BUG: 条件列表为空（应该在 Pydantic 验证时被拒绝）。"
            "如果看到这个错误，说明验证逻辑有漏洞。"
        )

    # 解析等待配置
    enabled = wait_config.get('enabled', False) if wait_config else False
    timeout_ms = wait_config.get('timeout', 3000) if wait_config else 3000
    interval_ms = wait_config.get('interval', 300) if wait_config else 300

    # 验证等待配置参数
    if enabled:
        if timeout_ms <= 0:
            raise ValueError(f"timeout 必须为正数，当前值: {timeout_ms}")
        if interval_ms <= 0:
            raise ValueError(f"interval 必须为正数，当前值: {interval_ms}")

    # 运算符统一处理
    operators = {'and': all, 'or': any}
    apply_operator = operators[operator]

    # 计算截止时间
    start_time = time.time()
    deadline = start_time + (timeout_ms / 1000.0) if enabled else 0
    attempt = 0

    while True:
        attempt += 1

        # 执行所有条件
        results = []
        all_details = []

        for idx, condition in enumerate(conditions):
            success, details = execute_condition(driver, condition, platform)
            results.append(success)
            all_details.append({
                "index": idx,
                "type": condition.get('type'),
                "success": success,
                "details": details,
            })

        # 使用统一运算符处理
        final_success = apply_operator(results)

        # 构造结果详情
        result_details = {
            "conditions": all_details,
            "attempts": attempt,
            "operator": operator,
        }

        # 断言成功
        if final_success:
            return True, "断言成功", result_details

        # 不启用等待，直接返回失败
        if not enabled:
            return False, "断言失败", result_details

        # 检查是否超时（在重试前检查）
        current_time = time.time()
        if current_time >= deadline:
            elapsed_ms = int((current_time - start_time) * 1000)
            return False, f"断言超时失败 ({elapsed_ms}ms / {timeout_ms}ms，重试 {attempt} 次)", result_details

        # 等待后重试
        time.sleep(interval_ms / 1000.0)
