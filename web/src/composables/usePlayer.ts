import { ref, computed, type ComputedRef } from 'vue'
import type { Platform } from '@/api/types'
import { tap, sendCommand, getHierarchy, assertCombined, type AssertCombinedRequest } from '@/api'
import type {
  RecordingFile,
  RecordedAction,
  FailureBehavior,
  PlaybackState,
  PlaybackProgress,
  AssertParams,
  StepResult,
} from '@/types/recording'

const DEFAULT_FAILURE_BEHAVIOR: FailureBehavior = 'stop'

function normalizeFailureBehavior(value: unknown): FailureBehavior {
  return value === 'continue' || value === 'stop' ? value : DEFAULT_FAILURE_BEHAVIOR
}

const DEFAULT_GLOBAL_FAILURE_CONTROL = {
  enabled: false,
  onExecuteFailure: DEFAULT_FAILURE_BEHAVIOR,
  onAssertFailure: DEFAULT_FAILURE_BEHAVIOR,
} as const satisfies {
  enabled: boolean
  onExecuteFailure: FailureBehavior
  onAssertFailure: FailureBehavior
}

type FailureKind = 'execute' | 'assert'

class AssertFailureError extends Error {
  public readonly details?: unknown
  public readonly screenshot?: string

  constructor(message: string, details?: unknown, screenshot?: string) {
    super(message)
    this.name = 'AssertFailureError'
    this.details = details
    this.screenshot = screenshot
  }
}

/**
 * 回放引擎
 * 负责执行录制的操作序列
 */
export function usePlayer(
  platform: Platform,
  serial: string,
  screenSize: ComputedRef<{ width: number; height: number }>
) {
  // 回放状态
  const state = ref<PlaybackState>('idle')
  const currentIndex = ref(-1)
  const recording = ref<RecordingFile | null>(null)
  const error = ref<string | null>(null)
  const speed = ref(1.0) // 回放速度倍率

  // 步骤执行结果追踪
  const stepResults = ref<Map<string, StepResult>>(new Map())

  // 计算属性
  const progress = computed<PlaybackProgress>(() => ({
    currentIndex: currentIndex.value,
    totalSteps: recording.value?.actions.length || 0,
    elapsedTime: 0, // TODO: 实现实际经过时间追踪
    state: state.value,
    error: error.value || undefined,
  }))

  const isPlaying = computed(() => state.value === 'playing')
  const isPaused = computed(() => state.value === 'paused')
  const canPlay = computed(() => recording.value !== null && recording.value.actions.length > 0)

  const globalFailureControl = computed(() => recording.value?.config.globalFailureControl)

  /**
   * 获取步骤执行结果
   */
  function getStepResult(actionId: string): StepResult | undefined {
    return stepResults.value.get(actionId)
  }

  /**
   * 设置步骤执行结果
   */
  function setStepResult(actionId: string, result: StepResult) {
    stepResults.value.set(actionId, result)
  }

  /**
   * 重置所有步骤结果
   */
  function resetStepResults() {
    stepResults.value.clear()
  }

  function getOrInitGlobalFailureControl() {
    if (!recording.value) return { ...DEFAULT_GLOBAL_FAILURE_CONTROL }

    const existing = recording.value.config.globalFailureControl
    if (!existing) {
      const next = { ...DEFAULT_GLOBAL_FAILURE_CONTROL }
      recording.value.config.globalFailureControl = next
      return next
    }

    // 规范化，避免脏数据把回放逻辑搞崩
    existing.enabled = Boolean(existing.enabled)
    existing.onExecuteFailure = normalizeFailureBehavior(existing.onExecuteFailure)
    existing.onAssertFailure = normalizeFailureBehavior(existing.onAssertFailure)
    return existing
  }

  function getEffectiveFailureBehavior(action: RecordedAction, kind: FailureKind): FailureBehavior {
    const global = getOrInitGlobalFailureControl()
    if (global.enabled) {
      return kind === 'execute' ? global.onExecuteFailure : global.onAssertFailure
    }
    return kind === 'execute'
      ? normalizeFailureBehavior(action.onExecuteFailure)
      : normalizeFailureBehavior(action.onAssertFailure)
  }

  function updateGlobalFailureControl(
    updates: Partial<{ enabled: boolean; onExecuteFailure: FailureBehavior; onAssertFailure: FailureBehavior }>
  ) {
    const current = getOrInitGlobalFailureControl()
    current.enabled = updates.enabled ?? current.enabled
    current.onExecuteFailure = updates.onExecuteFailure ?? current.onExecuteFailure
    current.onAssertFailure = updates.onAssertFailure ?? current.onAssertFailure
  }

  function normalizeRecordingForPlayback(file: RecordingFile): RecordingFile {
    // 补齐全局配置，避免到处写 if (?.)
    if (!file.config.globalFailureControl) {
      file.config.globalFailureControl = { ...DEFAULT_GLOBAL_FAILURE_CONTROL }
    } else {
      file.config.globalFailureControl.enabled = Boolean(file.config.globalFailureControl.enabled)
      file.config.globalFailureControl.onExecuteFailure = normalizeFailureBehavior(
        file.config.globalFailureControl.onExecuteFailure
      )
      file.config.globalFailureControl.onAssertFailure = normalizeFailureBehavior(
        file.config.globalFailureControl.onAssertFailure
      )
    }

    // 补齐步骤级字段（向后兼容：老录制文件可能缺字段）
    for (const action of file.actions) {
      ;(action as any).onExecuteFailure = normalizeFailureBehavior((action as any).onExecuteFailure)
      ;(action as any).onAssertFailure = normalizeFailureBehavior((action as any).onAssertFailure)
    }

    return file
  }

  /**
   * 加载录制文件
   */
  function load(file: RecordingFile) {
    recording.value = normalizeRecordingForPlayback(file)
    currentIndex.value = -1
    state.value = 'idle'
    error.value = null
    resetStepResults() // 重置结果
  }

  /**
   * 清空加载
   */
  function unload() {
    recording.value = null
    currentIndex.value = -1
    state.value = 'idle'
    error.value = null
    resetStepResults() // 重置结果
  }

  /**
   * 等待指定时间
   */
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms / speed.value))
  }

  /**
   * 验证屏幕尺寸并将比例坐标缩放为绝对坐标
   */
  function scaleCoordinates(coords: { scaleX: number; scaleY: number }): { x: number; y: number } {
    const { width, height } = screenSize.value
    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error(`无法回放:屏幕尺寸无效(${width}x${height}),请确保设备已连接并加载了屏幕信息`)
    }
    return {
      x: Math.round(coords.scaleX * width),
      y: Math.round(coords.scaleY * height),
    }
  }

  /**
   * 通过XPath查找元素并获取中心坐标
   */
  async function findElementByXPath(xpath: string): Promise<{ x: number; y: number } | null> {
    try {
      // 获取当前UI层级
      const hierarchy = await getHierarchy(platform, serial)

      // 遍历查找xpath匹配的节点
      function findNode(nodes: any[]): any {
        for (const node of nodes) {
          if (node.xpath === xpath) {
            return node
          }
          if (node.children) {
            const found = findNode(node.children)
            if (found) return found
          }
        }
        return null
      }

      const node = findNode(hierarchy.nodes)
      if (!node || !node.bounds) return null

      // 计算中心点
      const [x1, y1, x2, y2] = node.bounds
      return {
        x: Math.round((x1 + x2) / 2),
        y: Math.round((y1 + y2) / 2),
      }
    } catch (e) {
      console.error('XPath查找失败:', e)
      return null
    }
  }

  /**
   * 执行单个操作
   */
  async function executeAction(action: RecordedAction): Promise<void> {
    switch (action.type) {
      case 'tap': {
        let finalX: number
        let finalY: number

        // 如果录制时记录了xpath，优先尝试使用xpath定位
        if (action.xpath) {
          const coords = await findElementByXPath(action.xpath.selector)
          if (coords) {
            // XPath定位成功
            finalX = coords.x
            finalY = coords.y
          } else {
            // XPath定位失败，降级使用坐标
            console.warn('XPath查找失败，降级使用比例缩放坐标:', action.xpath.selector)
            if (!action.coords) {
              throw new Error('Tap操作缺少坐标信息')
            }
            const scaled = scaleCoordinates(action.coords)
            finalX = scaled.x
            finalY = scaled.y
          }
        } else {
          // 录制时未记录xpath，直接使用坐标
          if (!action.coords) {
            throw new Error('Tap操作缺少坐标信息')
          }
          const scaled = scaleCoordinates(action.coords)
          finalX = scaled.x
          finalY = scaled.y
        }

        await tap(platform, serial, finalX, finalY)
        break
      }

      case 'swipe': {
        if (!action.coords || !action.endCoords) {
          throw new Error('Swipe操作缺少坐标信息')
        }

        // 坐标模式:按比例缩放
        const start = scaleCoordinates(action.coords)
        const end = scaleCoordinates(action.endCoords)

        const params = action.params as { duration?: number }
        await sendCommand(platform, serial, 'swipe', {
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
          duration: params.duration || 0.5,
        })
        break
      }

      case 'input': {
        const params = action.params as { text: string }
        await sendCommand(platform, serial, 'sendKeys', { text: params.text })
        break
      }

      case 'sleep': {
        const params = action.params as { duration: number }
        await sleep(params.duration)
        break
      }

      case 'back': {
        await sendCommand(platform, serial, 'back', {})
        break
      }

      case 'home': {
        await sendCommand(platform, serial, 'home', {})
        break
      }

      case 'command': {
        const params = action.params as { command: string; args?: Record<string, unknown> }
        await sendCommand(platform, serial, params.command, params.args || {})
        break
      }

      case 'assert': {
        const params = action.params as AssertParams

        // 构造组合断言请求
        const request: AssertCombinedRequest = {
          operator: params.operator,
          conditions: params.conditions.map((c) => {
            if (c.type === 'element') {
              return {
                type: 'element',
                selector: c.selector,
                expect: c.expect,
              }
            } else {
              return {
                type: 'image',
                template: c.template,
                expect: c.expect,
              }
            }
          }),
          wait: params.wait,
          platform: platform,  // 传递平台参数用于属性映射
        }

        // 调用断言 API
        const result = await assertCombined(platform, serial, request)

        // 如果断言失败，交由上层决定 continue/stop
        if (!result.success) {
          const errorMsg = `断言失败: ${result.message}`
          throw new AssertFailureError(errorMsg, result.details, result.screenshot)
        }

        break
      }

      default:
        console.warn('未知操作类型')
    }
  }

  /**
   * 开始回放
   */
  async function play() {
    if (!recording.value || recording.value.actions.length === 0) {
      error.value = '没有可回放的录制'
      return
    }

    // 如果是暂停状态,继续播放
    if (state.value === 'paused') {
      state.value = 'playing'

      // 如果暂停发生在“步骤已完成”之后，避免恢复时重复执行同一步
      if (
        currentIndex.value >= 0 &&
        currentIndex.value < recording.value.actions.length &&
        (() => {
          const action = recording.value!.actions[currentIndex.value]!
          const result = stepResults.value.get(action.id)
          return result && result.status !== 'running'
        })()
      ) {
        currentIndex.value++
      }
    } else {
      // 重新开始
      currentIndex.value = 0
      state.value = 'playing'
      error.value = null
      resetStepResults() // 重新开始时重置所有结果
    }

    // 回放循环
    while (currentIndex.value < recording.value.actions.length) {
      // 检查状态是否被改变（暂停/停止）
      if (state.value !== 'playing') {
        break
      }

      const action = recording.value.actions[currentIndex.value]!
      const startTime = Date.now()

      // 标记当前步骤为运行中
      setStepResult(action.id, { status: 'running' })

      try {
        // 执行操作
        await executeAction(action)

        // 标记步骤成功
        const duration = Date.now() - startTime
        setStepResult(action.id, { status: 'success', duration })
      } catch (err) {
        const failureKind: FailureKind = err instanceof AssertFailureError ? 'assert' : 'execute'
        const duration = Date.now() - startTime
        const errorMsg = err instanceof Error ? err.message : String(err)
        setStepResult(action.id, { status: 'failed', error: errorMsg, duration })

        const behavior = getEffectiveFailureBehavior(action, failureKind)

        if (behavior === 'stop') {
          error.value = errorMsg
          state.value = 'error'
          console.error(`回放失败在步骤 ${currentIndex.value}:`, err)
          if (err instanceof AssertFailureError && err.screenshot) {
            console.log('失败截图:', `data:image/jpeg;base64,${err.screenshot}`)
          }
          break
        }

        console.warn(`步骤失败但继续回放(步骤 ${currentIndex.value}, ${failureKind} failure):`, err)
      }

      // 再次检查状态（executeAction可能很耗时）
      if (state.value !== 'playing') {
        break
      }

      // 使用当前操作的 waitAfter 作为下一步前的等待时间（失败 continue 也遵循同一规则）
      if (action.waitAfter > 0) {
        await sleep(action.waitAfter)

        // 再次检查状态（sleep后可能被暂停）
        if (state.value !== 'playing') {
          break
        }
      }

      currentIndex.value++
    }

    // 回放完成
    if (state.value === 'playing') {
      state.value = 'idle'
      currentIndex.value = -1
    }
  }

  /**
   * 暂停回放
   */
  function pause() {
    if (state.value === 'playing') {
      state.value = 'paused'
    }
  }

  /**
   * 停止回放
   */
  function stop() {
    state.value = 'stopped'
    currentIndex.value = -1
    error.value = null
  }

  /**
   * 单步执行(执行下一步)
   */
  async function stepNext() {
    if (!recording.value || currentIndex.value >= recording.value.actions.length - 1) {
      return
    }

    state.value = 'paused'
    currentIndex.value++

    const action = recording.value.actions[currentIndex.value]!

    try {
      await executeAction(action)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      state.value = 'error'
      console.error(`单步执行失败在步骤 ${currentIndex.value}:`, err)
    }
  }

  /**
   * 跳转到指定步骤(不执行)
   */
  function seekTo(index: number) {
    if (recording.value && index >= 0 && index < recording.value.actions.length) {
      currentIndex.value = index
      state.value = 'paused'
    }
  }

  /**
   * 设置回放速度
   */
  function setSpeed(newSpeed: number) {
    speed.value = Math.max(0.1, Math.min(5.0, newSpeed))
  }

  return {
    // 状态
    state,
    currentIndex,
    recording,
    error,
    speed,
    progress,
    isPlaying,
    isPaused,
    canPlay,

    // 控制
    load,
    unload,
    play,
    pause,
    stop,
    stepNext,
    seekTo,
    setSpeed,

    // 步骤结果追踪
    stepResults,
    getStepResult,

    // 全局失败控制（用于 UI 绑定）
    globalFailureControl,
    updateGlobalFailureControl,
  }
}
