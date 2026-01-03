import { ref, computed, type ComputedRef } from 'vue'
import type { Platform } from '@/api/types'
import { tap, sendCommand, getHierarchy } from '@/api'
import type {
  RecordingFile,
  RecordedAction,
  PlaybackState,
  PlaybackProgress,
} from '@/types/recording'

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

  /**
   * 加载录制文件
   */
  function load(file: RecordingFile) {
    recording.value = file
    currentIndex.value = -1
    state.value = 'idle'
    error.value = null
  }

  /**
   * 清空加载
   */
  function unload() {
    recording.value = null
    currentIndex.value = -1
    state.value = 'idle'
    error.value = null
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
    } else {
      // 重新开始
      currentIndex.value = 0
      state.value = 'playing'
      error.value = null
    }

    // 回放循环
    while (currentIndex.value < recording.value.actions.length) {
      // 检查状态是否被改变（暂停/停止）
      if (state.value !== 'playing') {
        break
      }

      const action = recording.value.actions[currentIndex.value]!

      try {
        // 执行操作
        await executeAction(action)

        // 再次检查状态（executeAction可能很耗时）
        if (state.value !== 'playing') {
          break
        }

        // 等待到下一个操作的时间间隔
        if (currentIndex.value < recording.value.actions.length - 1) {
          const nextAction = recording.value.actions[currentIndex.value + 1]!
          const delay = nextAction.relativeTime - action.relativeTime
          await sleep(delay)

          // 再次检查状态（sleep后可能被暂停）
          if (state.value !== 'playing') {
            break
          }
        }

        currentIndex.value++
      } catch (err) {
        // 保守策略:出错即停
        error.value = err instanceof Error ? err.message : String(err)
        state.value = 'error'
        console.error(`回放失败在步骤 ${currentIndex.value}:`, err)
        break
      }
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
  }
}
