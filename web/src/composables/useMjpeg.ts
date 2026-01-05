/**
 * iOS MJPEG 实时视频流管理
 * 使用 go-ios screenshot --stream 功能
 */

import { ref, computed, watch, onUnmounted, type Ref } from 'vue'
import type { Platform } from '@/api/types'
import { sendCommand } from '@/api'

export interface MjpegOptions {
  platform: Ref<Platform>
  serial: Ref<string>
  enabled: Ref<boolean>
}

export function useMjpeg(options: MjpegOptions) {
  const { platform, serial, enabled } = options

  const isStreaming = ref(false)
  const error = ref<string | null>(null)

  // MJPEG URL (后端代理 go-ios screenshot stream 的 9100 端口)
  const mjpegUrl = computed(() => {
    if (!isStreaming.value) return null
    return `/api/${platform.value}/${serial.value}/mjpeg`
  })

  /**
   * 启动 MJPEG 流（启动 go-ios screenshot stream）
   */
  async function startStream() {
    if (isStreaming.value) {
      console.log('[iOS MJPEG] Stream already started')
      return
    }

    try {
      console.log('[iOS MJPEG] Starting go-ios screenshot stream...')

      // 调用后端 API 启动 go-ios screenshot stream
      await sendCommand(platform.value, serial.value, 'start_mjpeg_stream', {})

      isStreaming.value = true
      error.value = null

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
      console.log('[iOS MJPEG] Stopping screenshot stream...')

      // 调用后端 API 停止 go-ios screenshot stream
      await sendCommand(platform.value, serial.value, 'stop_mjpeg_stream', {})

      isStreaming.value = false

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
    startStream,
    stopStream,
  }
}
