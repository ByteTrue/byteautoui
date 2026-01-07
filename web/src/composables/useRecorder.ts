import { ref, computed, type ComputedRef } from 'vue'
import type { Platform, UINode } from '@/api/types'
import type {
  RecordedAction,
  RecordingFile,
  RecordingConfig,
  FailureBehavior,
  CoordinateInfo,
  XPathInfo,
  ElementInfo,
  ActionParams,
  TapParams,
  SwipeParams,
  InputParams,
  SleepParams,
  CommandParams,
  AssertParams,
} from '@/types/recording'
import { downloadJSON } from '@/utils/download'

const DEFAULT_FAILURE_BEHAVIOR: FailureBehavior = 'stop'

function normalizeFailureBehavior(value: unknown): FailureBehavior {
  if (value === 'continue' || value === 'stop') return value
  return DEFAULT_FAILURE_BEHAVIOR
}

function normalizeRecordingConfig(config?: Partial<RecordingConfig>): RecordingConfig {
  return {
    captureScreenshots: config?.captureScreenshots ?? false,
    screenshotQuality: config?.screenshotQuality ?? 0.6,
    recordElementDetails: config?.recordElementDetails ?? true,
    globalFailureControl: {
      enabled: config?.globalFailureControl?.enabled ?? false,
      onFailure: normalizeFailureBehavior(config?.globalFailureControl?.onFailure),
    },
  }
}

function normalizeRecordedAction(action: RecordedAction): RecordedAction {
  return {
    ...action,
    onFailure: normalizeFailureBehavior(action.onFailure),
  }
}

/**
 * 录制引擎
 * 负责捕获用户操作并保存为结构化数据
 */
export function useRecorder(
  platform: Platform,
  serial: string,
  screenSize: ComputedRef<{ width: number; height: number }>
) {
  // 录制状态
  const isRecording = ref(false)
  const isPaused = ref(false)
  const actions = ref<RecordedAction[]>([])
  const startTime = ref(0)
  const recordingName = ref(`Recording_${Date.now()}`)

  // 录制配置(默认配置)
  const config = ref<RecordingConfig>(normalizeRecordingConfig())

  // 计算属性
  const duration = computed(() => {
    if (actions.value.length === 0) return 0
    const lastAction = actions.value[actions.value.length - 1]
    return lastAction?.relativeTime || 0
  })

  const actionCount = computed(() => actions.value.length)

  /**
   * 开始录制
   */
  function start(name?: string) {
    isRecording.value = true
    isPaused.value = false
    actions.value = []
    startTime.value = Date.now()
    if (name) recordingName.value = name
  }

  /**
   * 停止录制
   */
  function stop() {
    isRecording.value = false
    isPaused.value = false
  }

  /**
   * 暂停录制
   */
  function pause() {
    if (isRecording.value) {
      isPaused.value = true
    }
  }

  /**
   * 继续录制
   */
  function resume() {
    if (isRecording.value) {
      isPaused.value = false
    }
  }

  /**
   * 清空录制
   */
  function clear() {
    actions.value = []
    startTime.value = 0
  }

  /**
   * 生成坐标信息
   */
  function createCoordinateInfo(x: number, y: number): CoordinateInfo {
    const { width, height } = screenSize.value

    // 真正的验证，而不是用错误值掩盖问题
    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error(`Invalid screen size: ${width}x${height}. Recording requires valid screen dimensions.`)
    }

    return {
      x,
      y,
      scaleX: x / width,
      scaleY: y / height,
    }
  }

  /**
   * 生成XPath信息(从UINode)
   */
  function createXPathInfo(node: UINode | null): XPathInfo | undefined {
    if (!node || !node.xpath) return undefined

    return {
      selector: node.xpath,
    }
  }

  /**
   * 生成元素信息(从UINode)
   */
  function createElementInfo(node: UINode | null): ElementInfo | undefined {
    if (!node || !config.value.recordElementDetails) return undefined

    return {
      text: node.text,
      label: node.label,
      resource_id: node.resource_id,
      class_name: node.class_name,
      content_desc: node.content_desc,
      bounds: node.bounds || [0, 0, 0, 0],
      key: node.key,
    }
  }

  /**
   * 捕获截图(可选功能)
   */
  async function captureScreenshot(): Promise<string | undefined> {
    if (!config.value.captureScreenshots) return undefined

    // TODO: 从ScreenPanel获取当前截图
    // 可以通过canvas.toDataURL()实现
    return undefined
  }

  /**
   * 添加操作(通用方法)
   */
  async function addAction(
    type: RecordedAction['type'],
    params: ActionParams,
    coords?: CoordinateInfo,
    endCoords?: CoordinateInfo,
    selectedNode?: UINode | null
  ) {
    if (!isRecording.value || isPaused.value) return

    const now = Date.now()
    const currentRelativeTime = now - startTime.value

    // 更新前一个action的waitAfter（如果存在）
    if (actions.value.length > 0) {
      const lastAction = actions.value[actions.value.length - 1]!
      const waitTime = currentRelativeTime - lastAction.relativeTime
      // 直接修改（因为是ref数组中的对象）
      ;(lastAction as any).waitAfter = waitTime
    }

    const baseAction = {
      id: crypto.randomUUID(),
      timestamp: now,
      relativeTime: currentRelativeTime,
      waitAfter: 0, // 默认为0，会在下一个action添加时更新
      onFailure: DEFAULT_FAILURE_BEHAVIOR,
      screenshot: await captureScreenshot(),
    }

    let action: RecordedAction

    // 根据类型构建正确的 action 对象
    switch (type) {
      case 'tap': {
        const xpathInfo = createXPathInfo(selectedNode || null)
        action = {
          ...baseAction,
          type: 'tap',
          // 有XPath时不记录coords,避免降级
          coords: xpathInfo ? undefined : coords!,
          xpath: xpathInfo,
          element: createElementInfo(selectedNode || null),
          params: params as TapParams,
        }
        break
      }
      case 'swipe':
        action = {
          ...baseAction,
          type: 'swipe',
          coords: coords!,
          endCoords: endCoords!,
          element: createElementInfo(selectedNode || null),
          params: params as SwipeParams,
        }
        break
      case 'input':
        action = {
          ...baseAction,
          type: 'input',
          element: createElementInfo(selectedNode || null),
          params: params as InputParams,
        }
        break
      case 'sleep':
        action = {
          ...baseAction,
          type: 'sleep',
          params: params as SleepParams,
        }
        break
      case 'command':
      case 'back':
      case 'home':
        action = {
          ...baseAction,
          type: type as 'command' | 'back' | 'home',
          params: params as CommandParams,
        }
        break
      case 'assert':
        action = {
          ...baseAction,
          type: 'assert',
          params: params as any, // AssertParams
        }
        break
      default:
        console.warn('未知操作类型，跳过录制')
        return
    }

    actions.value.push(action)
  }

  /**
   * 录制点击操作
   */
  async function recordTap(x: number, y: number, selectedNode?: UINode | null) {
    const coords = createCoordinateInfo(x, y)
    await addAction('tap', { x, y }, coords, undefined, selectedNode)
  }

  /**
   * 录制滑动操作
   */
  async function recordSwipe(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration?: number,
    selectedNode?: UINode | null
  ) {
    const startCoords = createCoordinateInfo(startX, startY)
    const endCoords = createCoordinateInfo(endX, endY)
    await addAction(
      'swipe',
      { startX, startY, endX, endY, duration },
      startCoords,
      endCoords,
      selectedNode
    )
  }

  /**
   * 录制输入操作
   */
  async function recordInput(text: string, selectedNode?: UINode | null) {
    await addAction('input', { text }, undefined, undefined, selectedNode)
  }

  /**
   * 录制等待操作(手动插入)
   */
  async function recordSleep(duration: number) {
    await addAction('sleep', { duration })
  }

  /**
   * 录制命令操作(back/home等)
   */
  async function recordCommand(command: string, args?: Record<string, unknown>) {
    await addAction('command', { command, args })
  }

  /**
   * 录制断言操作（支持编辑模式添加）
   * 断言可以在录制中或有已录制内容时添加
   */
  async function recordAssert(params: AssertParams, onFailure?: FailureBehavior) {
    const failureBehavior = onFailure || DEFAULT_FAILURE_BEHAVIOR

    // 如果在录制中，使用标准流程
    if (isRecording.value && !isPaused.value) {
      await addAction('assert', params)
      // 更新最后添加的action的失败行为
      const last = actions.value[actions.value.length - 1]
      if (last && last.type === 'assert') {
        last.onFailure = failureBehavior
      }
      return
    }

    // 编辑模式：直接添加到 actions 数组
    const now = Date.now()
    const lastAction = actions.value[actions.value.length - 1]
    const newRelativeTime = lastAction
      ? lastAction.relativeTime + (lastAction.waitAfter || 1000)
      : 0

    // 更新前一个action的waitAfter（默认1秒间隔）
    if (lastAction && lastAction.waitAfter === 0) {
      ;(lastAction as any).waitAfter = 1000
    }

    const action: RecordedAction = {
      id: crypto.randomUUID(),
      type: 'assert',
      timestamp: now,
      relativeTime: newRelativeTime,
      waitAfter: 0, // 最后一个action默认为0
      onFailure: failureBehavior,
      params,
    }
    actions.value.push(action)
  }

  /**
   * 删除操作
   */
  function deleteAction(id: string) {
    const index = actions.value.findIndex((a) => a.id === id)
    if (index !== -1) {
      actions.value.splice(index, 1)
    }
  }

  /**
   * 更新操作（类型安全版本）
   *
   * @param id 操作ID
   * @param updates 部分更新（必须保持 type、id、timestamp 不变）
   * @returns 是否更新成功
   */
  function updateAction(id: string, updates: Partial<RecordedAction>): boolean {
    const index = actions.value.findIndex((a) => a.id === id)
    if (index === -1) {
      console.warn(`Action with id ${id} not found`)
      return false
    }

    const current = actions.value[index]!
    const merged = { ...current, ...updates }

    // 类型守卫：禁止修改不可变字段
    if (merged.type !== current.type) {
      throw new Error('Cannot change action type')
    }
    if (merged.id !== current.id) {
      throw new Error('Cannot change action id')
    }
    if (merged.timestamp !== current.timestamp) {
      throw new Error('Cannot change action timestamp')
    }

    ;(merged as RecordedAction).onFailure = normalizeFailureBehavior((merged as RecordedAction).onFailure)

    // 使用 splice 确保 Vue 响应式系统能正确跟踪数组变化
    actions.value.splice(index, 1, merged as RecordedAction)
    return true
  }

  /**
   * 重新排序操作 - 拖拽后基于waitAfter重新计算relativeTime
   * @param reorderedActions 重新排序后的操作列表
   */
  function reorderActions(reorderedActions: RecordedAction[]) {
    // 基于每个action的waitAfter重新计算relativeTime
    let currentRelativeTime = 0

    const recalculated = reorderedActions.map((action) => {
      const newAction = { ...action, relativeTime: currentRelativeTime }
      // 累加当前action的waitAfter作为下一个action的relativeTime
      currentRelativeTime += action.waitAfter || 500 // 默认500ms间隔
      return newAction
    })

    actions.value = recalculated
  }

  /**
   * 导出为RecordingFile
   */
  function exportRecording(customName?: string): RecordingFile {
    return {
      version: '1.0',
      name: customName || recordingName.value,
      description: undefined,
      platform,
      deviceInfo: {
        serial,
        screenWidth: screenSize.value.width,
        screenHeight: screenSize.value.height,
      },
      createdAt: startTime.value,
      updatedAt: Date.now(),
      duration: duration.value,
      config: config.value,
      actions: actions.value,
    }
  }

  /**
   * 导入RecordingFile
   */
  function importRecording(file: RecordingFile) {
    recordingName.value = file.name
    actions.value = Array.isArray(file.actions) ? file.actions.map(normalizeRecordedAction) : []
    startTime.value = typeof file.createdAt === 'number' ? file.createdAt : 0
    config.value = normalizeRecordingConfig(file.config)
  }

  /**
   * 保存到JSON文件(下载)
   */
  function saveToFile() {
    const recording = exportRecording()
    downloadJSON(recording, `${recording.name}.byteautoui`)
  }

  /**
   * 验证录制文件格式
   */
  function validateRecordingFile(data: any): data is RecordingFile {
    if (!data || typeof data !== 'object') {
      return false
    }

    // 验证必需字段
    if (data.version !== '1.0') {
      console.error('不支持的文件版本:', data.version)
      return false
    }

    if (typeof data.name !== 'string') {
      console.error('缺少录制名称')
      return false
    }

    if (!data.platform || !['android', 'ios', 'harmony'].includes(data.platform)) {
      console.error('无效的平台:', data.platform)
      return false
    }

    if (!data.deviceInfo || typeof data.deviceInfo.screenWidth !== 'number' || typeof data.deviceInfo.screenHeight !== 'number') {
      console.error('缺少设备信息')
      return false
    }

    if (!Array.isArray(data.actions)) {
      console.error('缺少操作列表')
      return false
    }

    // 验证每个操作的基本结构
    for (let i = 0; i < data.actions.length; i++) {
      const action = data.actions[i]
      if (!action || typeof action !== 'object') {
        console.error(`操作 ${i} 格式错误`)
        return false
      }

      if (!action.type || typeof action.timestamp !== 'number' || typeof action.relativeTime !== 'number') {
        console.error(`操作 ${i} 缺少必需字段`)
        return false
      }

      // 验证 tap: 必须有 coords 或 xpath
      if (action.type === 'tap' && !action.coords && !action.xpath) {
        console.error(`操作 ${i} (tap) 缺少坐标或XPath信息`)
        return false
      }

      // 验证 swipe: 必须有 coords
      if (action.type === 'swipe' && !action.coords) {
        console.error(`操作 ${i} (swipe) 缺少坐标信息`)
        return false
      }

      if (action.type === 'swipe' && !action.endCoords) {
        console.error(`操作 ${i} (swipe) 缺少结束坐标`)
        return false
      }
    }

    return true
  }

  /**
   * 从文件加载(上传)
   */
  async function loadFromFile(): Promise<RecordingFile> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.byteautoui.json,.json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) {
          reject(new Error('未选择文件'))
          return
        }

        try {
          const text = await file.text()
          const data = JSON.parse(text)

          if (!validateRecordingFile(data)) {
            reject(new Error('文件格式验证失败，请检查是否为有效的录制文件'))
            return
          }

          importRecording(data)
          resolve(data)
        } catch (error) {
          if (error instanceof SyntaxError) {
            reject(new Error('文件格式错误：无效的JSON'))
          } else {
            reject(error)
          }
        }
      }
      input.click()
    })
  }

  return {
    // 状态
    isRecording,
    isPaused,
    actions,
    recordingName,
    config,
    duration,
    actionCount,

    // 录制控制
    start,
    stop,
    pause,
    resume,
    clear,

    // 录制操作
    recordTap,
    recordSwipe,
    recordInput,
    recordSleep,
    recordCommand,
    recordAssert,

    // 编辑操作
    deleteAction,
    updateAction,
    reorderActions,

    // 文件操作
    exportRecording,
    importRecording,
    saveToFile,
    loadFromFile,
  }
}
