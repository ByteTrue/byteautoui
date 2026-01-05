import type { Platform } from '@/api/types'

/**
 * 录制配置
 */
export interface RecordingConfig {
  captureScreenshots: boolean // 是否捕获截图
  screenshotQuality: number // 截图质量 0-1
  recordElementDetails: boolean // 是否记录元素详细信息
}

/**
 * 坐标信息(支持坐标模式回放)
 */
export interface CoordinateInfo {
  x: number // 绝对坐标
  y: number
  scaleX: number // x / screenWidth (比例坐标,用于跨设备)
  scaleY: number // y / screenHeight
}

/**
 * XPath信息(支持元素模式回放)
 */
export interface XPathInfo {
  selector: string // 完整XPath表达式
  fallbackCoords: { x: number; y: number } // XPath失败时的降级坐标
}

/**
 * 元素详细信息(用于调试和智能回放)
 */
export interface ElementInfo {
  text?: string
  label?: string
  resource_id?: string
  class_name?: string
  content_desc?: string
  bounds: [number, number, number, number]
  key?: string // UINode的key
}

/**
 * 操作参数类型(类型安全)
 */
export interface TapParams {
  x: number
  y: number
}

export interface SwipeParams {
  startX: number
  startY: number
  endX: number
  endY: number
  duration?: number // 滑动时长(秒)
}

export interface InputParams {
  text: string
}

export interface SleepParams {
  duration: number // 等待时长(毫秒)
}

export interface CommandParams {
  command: string
  args?: Record<string, unknown>
}

// ============ 断言相关类型定义 ============

/**
 * 断言条件类型
 */
export type AssertConditionType = 'element' | 'image'

/**
 * 断言期望结果
 */
export type AssertExpect = 'exists' | 'not_exists'

/**
 * 元素选择器
 */
export interface ElementSelector {
  xpath: string
  attributes?: {
    text?: string
    resourceId?: string
    className?: string
  }
}

/**
 * 元素断言条件
 */
export interface ElementCondition {
  type: 'element'
  selector: ElementSelector
  expect: AssertExpect
}

/**
 * 图片模板
 */
export interface ImageTemplate {
  data: string        // Base64 编码的图片数据 (data:image/png;base64,...)
  threshold: number   // 相似度阈值 [0.0-1.0]，默认 0.9
  name?: string       // 可选的模板名称，用于显示
}

/**
 * 图片断言条件
 */
export interface ImageCondition {
  type: 'image'
  template: ImageTemplate
  expect: AssertExpect
}

/**
 * 断言条件联合类型
 */
export type AssertCondition = ElementCondition | ImageCondition

/**
 * 等待配置
 */
export interface WaitConfig {
  enabled: boolean
  timeout: number      // 毫秒
  interval: number     // 重试间隔，毫秒
}

/**
 * 断言动作参数
 */
export interface AssertParams {
  description?: string  // 用户自定义描述，用于步骤列表显示
  operator: 'and' | 'or'
  conditions: AssertCondition[]
  wait?: WaitConfig
}

export type ActionParams = TapParams | SwipeParams | InputParams | SleepParams | CommandParams | AssertParams

/**
 * 录制的单个操作 - 使用判别联合类型确保类型安全
 *
 * 每种操作类型都有明确的必需字段，编译器会强制检查
 */

// 基础元数据（所有操作共享）
interface BaseAction {
  id: string
  timestamp: number
  relativeTime: number       // 相对于录制开始的时间（内部使用）
  waitAfter: number          // 完成后等待时间（毫秒），用于UI显示和编辑
  screenshot?: string
}

// Tap操作 - 必须有coords，可选xpath和element
export interface TapAction extends BaseAction {
  type: 'tap'
  coords: CoordinateInfo
  xpath?: XPathInfo
  element?: ElementInfo
  params: TapParams
}

// Swipe操作 - 必须有coords和endCoords，可选element
export interface SwipeAction extends BaseAction {
  type: 'swipe'
  coords: CoordinateInfo
  endCoords: CoordinateInfo
  element?: ElementInfo
  params: SwipeParams
}

// Input操作 - 不需要坐标，可选element（比如选中输入框）
export interface InputAction extends BaseAction {
  type: 'input'
  element?: ElementInfo
  params: InputParams
}

// Sleep操作 - 纯等待，无需其他字段
export interface SleepAction extends BaseAction {
  type: 'sleep'
  params: SleepParams
}

// 命令操作 (back/home/自定义命令) - 无需坐标
export interface CommandAction extends BaseAction {
  type: 'command' | 'back' | 'home'
  params: CommandParams
}

// 断言操作 - 验证界面状态
export interface AssertAction extends BaseAction {
  type: 'assert'
  params: AssertParams
}

// 判别联合类型 - TypeScript会根据type字段自动推断类型
export type RecordedAction =
  | TapAction
  | SwipeAction
  | InputAction
  | SleepAction
  | CommandAction
  | AssertAction

/**
 * 录制文件(完整会话)
 */
export interface RecordingFile {
  // 文件元数据
  version: '1.0' // 格式版本,用于未来兼容性
  name: string // 录制名称
  description?: string // 描述信息

  // 设备信息
  platform: Platform // android/ios/harmony
  deviceInfo: {
    serial: string
    screenWidth: number
    screenHeight: number
    model?: string
  }

  // 时间信息
  createdAt: number // 创建时间戳
  updatedAt: number // 最后修改时间戳
  duration: number // 录制总时长(毫秒)

  // 录制配置
  config: RecordingConfig

  // 操作列表
  actions: RecordedAction[]
}

/**
 * 回放模式
 */
export type PlaybackMode = 'coordinate' | 'xpath'

/**
 * 回放状态
 */
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped' | 'error'

/**
 * 回放进度
 */
export interface PlaybackProgress {
  currentIndex: number // 当前执行到的步骤索引
  totalSteps: number // 总步骤数
  elapsedTime: number // 已执行时长(毫秒)
  state: PlaybackState
  error?: string // 错误信息
}

/**
 * 步骤执行结果状态
 */
export type StepResultStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

/**
 * 步骤执行结果
 */
export interface StepResult {
  status: StepResultStatus
  error?: string      // 失败原因
  duration?: number   // 执行耗时(毫秒)
}
