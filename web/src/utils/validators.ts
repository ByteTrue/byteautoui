/**
 * 验证工具函数
 * 用于在创建对象时进行数据验证，确保不变式得到强制
 */

import type { AssertCondition, AssertParams, ImageTemplate, WaitConfig } from '../types/recording'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * 创建 AssertParams 并验证
 */
export function createAssertParams(
  operator: 'and' | 'or',
  conditions: AssertCondition[],
  options?: { description?: string; wait?: WaitConfig }
): AssertParams {
  // 验证条件不能为空
  if (conditions.length === 0) {
    throw new ValidationError('断言条件不能为空')
  }

  // 验证 wait 配置（如果提供）
  if (options?.wait) {
    validateWaitConfig(options.wait)
  }

  return {
    operator,
    conditions,
    ...options
  }
}

/**
 * 创建 ImageTemplate 并验证
 */
export function createImageTemplate(
  data: string,
  threshold: number,
  name?: string
): ImageTemplate {
  // 验证 threshold 范围
  if (threshold < 0 || threshold > 1) {
    throw new ValidationError(`threshold 必须在 [0, 1] 范围内，当前值: ${threshold}`)
  }

  // 验证 data 格式（简单检查）
  if (!data.startsWith('data:image/')) {
    throw new ValidationError('图片数据格式错误，必须是 Base64 格式 (data:image/...)')
  }

  return { data, threshold, name }
}

/**
 * 创建 WaitConfig 并验证
 */
export function createWaitConfig(
  timeout: number,
  interval: number = 300,
  enabled: boolean = true
): WaitConfig {
  // 验证 timeout
  if (timeout <= 0) {
    throw new ValidationError(`timeout 必须 > 0，当前值: ${timeout}`)
  }

  // 验证 interval
  if (interval <= 0) {
    throw new ValidationError(`interval 必须 > 0，当前值: ${interval}`)
  }

  // 验证 interval 不能大于 timeout
  if (interval > timeout) {
    throw new ValidationError(`interval(${interval}) 不能大于 timeout(${timeout})`)
  }

  return { enabled, timeout, interval }
}

/**
 * 验证 WaitConfig（不创建新对象）
 */
export function validateWaitConfig(config: WaitConfig): void {
  if (config.timeout <= 0) {
    throw new ValidationError(`timeout 必须 > 0，当前值: ${config.timeout}`)
  }

  if (config.interval <= 0) {
    throw new ValidationError(`interval 必须 > 0，当前值: ${config.interval}`)
  }

  if (config.interval > config.timeout) {
    throw new ValidationError(`interval(${config.interval}) 不能大于 timeout(${config.timeout})`)
  }
}
