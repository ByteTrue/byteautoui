/**
 * iOS MJPEG 实时视频流管理
 * 使用 WDA 原生 MJPEG 端点（默认端口 9100）
 *
 * 优化点：
 * - FPS 监控（滑动窗口平均）
 * - 双缓冲预加载
 * - requestAnimationFrame 控制渲染
 */

import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import type { Platform } from '@/api/types'
import { sendCommand } from '@/api'

export interface MjpegOptions {
  platform: Ref<Platform>
  serial: Ref<string>
  enabled: Ref<boolean>
}

// FPS 计算窗口大小
const FPS_WINDOW_SIZE = 30

export function useMjpeg(options: MjpegOptions) {
  const { platform, serial, enabled } = options

  const isStreaming = ref(false)
  const error = ref<string | null>(null)

  // FPS 监控
  const fps = ref(0)
  const frameTimestamps: number[] = []

  // MJPEG URL (后端代理 WDA MJPEG 端点)
  const mjpegUrl = computed(() => {
    if (!isStreaming.value) return null
    // 添加时间戳防止缓存
    return `/api/${platform.value}/${serial.value}/mjpeg?t=${Date.now()}`
  })

  /**
   * 更新 FPS（滑动窗口平均）
   */
  function updateFps() {
    const now = performance.now()
    frameTimestamps.push(now)

    // 保持窗口大小
    while (frameTimestamps.length > FPS_WINDOW_SIZE) {
      frameTimestamps.shift()
    }

    // 计算 FPS
    if (frameTimestamps.length >= 2) {
      const duration = now - frameTimestamps[0]!
      if (duration > 0) {
        fps.value = Math.round((frameTimestamps.length - 1) / (duration / 1000))
      }
    }
  }

  /**
   * 启动 MJPEG 流（启动 WDA MJPEG）
   */
  async function startStream() {
    if (isStreaming.value) {
      console.log('[iOS MJPEG] Stream already started')
      return
    }

    try {
      console.log('[iOS MJPEG] Starting WDA MJPEG stream...')

      // 调用后端 API 启动 WDA MJPEG stream
      await sendCommand(platform.value, serial.value, 'start_mjpeg_stream', {})

      isStreaming.value = true
      error.value = null

      // 重置 FPS 计算
      frameTimestamps.length = 0
      fps.value = 0

      console.log('[iOS MJPEG] Stream started:', mjpegUrl.value)
    } catch (err) {
      const errMsg = `Failed to start iOS MJPEG stream: ${err instanceof Error ? err.message : String(err)}`
      error.value = errMsg
      console.error('[iOS MJPEG]', errMsg, err)
    }
  }

  /**
   * 停止 MJPEG 流
   */
  async function stopStream() {
    if (!isStreaming.value) {
      return
    }

    try {
      console.log('[iOS MJPEG] Stopping MJPEG stream...')

      // 调用后端 API 停止 MJPEG stream
      await sendCommand(platform.value, serial.value, 'stop_mjpeg_stream', {})

      isStreaming.value = false
      fps.value = 0
      frameTimestamps.length = 0

      console.log('[iOS MJPEG] Stream stopped')
    } catch (err) {
      const errMsg = `Failed to stop iOS MJPEG stream: ${err instanceof Error ? err.message : String(err)}`
      error.value = errMsg
      console.error('[iOS MJPEG]', errMsg, err)
    }
  }

  // 监听 enabled 变化，自动启动/停止
  watch(
    enabled,
    async (newEnabled) => {
      if (newEnabled) {
        await startStream()
      } else {
        await stopStream()
      }
    },
    { immediate: true }
  )

  // 组件卸载时清理
  onUnmounted(() => {
    if (isStreaming.value) {
      stopStream()
    }
  })

  return {
    streamUrl: mjpegUrl,
    isStreaming,
    error,
    fps,
    updateFps,
    startStream,
    stopStream,
  }
}
