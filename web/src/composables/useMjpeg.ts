/**
 * iOS MJPEG 实时视频流管理
 *
 * 渲染策略：
 * - 优先使用 Canvas + requestAnimationFrame 主动渲染，提供最佳性能
 * - 当 Canvas/ImageBitmap API 不可用时，自动降级为 <img> 标签直接渲染
 *
 * 帧率控制：
 * - 限制最大渲染帧率为 30fps，避免过度消耗 CPU
 * - 使用滑动窗口计算实时 FPS 统计
 */

import { ref, computed, watch, onScopeDispose, isRef, type Ref } from 'vue'
import type { Platform } from '@/api/types'
import { sendCommand } from '@/api'
import { extractBoundary, parseMjpegStream } from '@/utils/mjpegStreamParser'
import { PREFER_MJPEG_CANVAS, MJPEG_MIN_RENDER_INTERVAL } from '@/config/mjpeg'

export interface MjpegOptions {
  platform: Ref<Platform>
  serial: Ref<string>
  enabled: Ref<boolean>
  canvasRef?: Ref<HTMLCanvasElement | null>
  preferCanvas?: Ref<boolean> | boolean
  onResize?: (width: number, height: number) => void
}

export function useMjpeg(options: MjpegOptions) {
  const { platform, serial, enabled } = options

  const canvasRef = options.canvasRef ?? ref<HTMLCanvasElement | null>(null)
  const preferCanvas = computed(() => {
    if (isRef(options.preferCanvas)) return options.preferCanvas.value
    if (typeof options.preferCanvas === 'boolean') return options.preferCanvas
    return PREFER_MJPEG_CANVAS
  })
  const canvasSupported = computed(
    () => typeof ReadableStream !== 'undefined' && typeof createImageBitmap !== 'undefined'
  )
  const canvasFailed = ref(false)
  const useCanvasRenderer = computed(
    () => preferCanvas.value && canvasSupported.value && !!canvasRef.value && !canvasFailed.value
  )

  const isStreaming = ref(false)
  const error = ref<string | null>(null)
  const fps = ref(0)
  const frameTimestamps: number[] = []

  const latestFrame = ref<ImageBitmap | null>(null)
  let renderHandle: number | null = null
  let lastRenderTime = 0
  let streamAbort: AbortController | null = null
  let streamTask: Promise<void> | null = null

  const mjpegUrl = computed(() => {
    if (!isStreaming.value) return null
    return `/api/${platform.value}/${serial.value}/mjpeg?t=${Date.now()}`
  })

  function resetFps() {
    fps.value = 0
    frameTimestamps.length = 0
  }

  function recordFrame(timestamp = performance.now()) {
    frameTimestamps.push(timestamp)

    // 仅保留最近1秒内的帧时间戳
    const cutoff = timestamp - 1000
    while (frameTimestamps.length && frameTimestamps[0]! < cutoff) {
      frameTimestamps.shift()
    }

    // 计算实时帧率：(帧数-1) / 时间间隔
    if (frameTimestamps.length >= 2) {
      const duration = frameTimestamps[frameTimestamps.length - 1]! - frameTimestamps[0]!
      if (duration > 0) {
        fps.value = Math.round((frameTimestamps.length - 1) / (duration / 1000))
      }
    } else {
      fps.value = 0
    }
  }

  function clearLatestFrame() {
    if (latestFrame.value) {
      latestFrame.value.close()
      latestFrame.value = null
    }
  }

  function stopRenderLoop() {
    if (renderHandle !== null) {
      cancelAnimationFrame(renderHandle)
      renderHandle = null
    }
    clearLatestFrame()
  }

  function startRenderLoop(ctx: CanvasRenderingContext2D) {
    if (renderHandle !== null) return
    lastRenderTime = -MJPEG_MIN_RENDER_INTERVAL

    const render = (timestamp: number) => {
      if (!useCanvasRenderer.value) {
        renderHandle = null
        return
      }

      if (timestamp - lastRenderTime >= MJPEG_MIN_RENDER_INTERVAL) {
        const frame = latestFrame.value
        const canvas = canvasRef.value
        if (frame && canvas) {
          // 当 canvas 尺寸与帧尺寸不匹配时更新并通知外部同步 drawingCanvas
          if (canvas.width !== frame.width || canvas.height !== frame.height) {
            canvas.width = frame.width
            canvas.height = frame.height
            options.onResize?.(frame.width, frame.height)
          }
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
          frame.close()
          latestFrame.value = null
          recordFrame(timestamp)
        }
        lastRenderTime = timestamp
      }

      renderHandle = requestAnimationFrame(render)
    }

    renderHandle = requestAnimationFrame(render)
  }

  async function startCanvasRenderer() {
    if (!useCanvasRenderer.value || streamTask || !mjpegUrl.value) return
    const canvas = canvasRef.value
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) {
      canvasFailed.value = true
      console.info('[iOS MJPEG] Canvas 不可用，降级为 <img> 渲染')
      return
    }

    streamAbort = new AbortController()
    const { signal } = streamAbort
    startRenderLoop(ctx)

    streamTask = (async () => {
      try {
        const response = await fetch(mjpegUrl.value!, { signal })
        if (!response.ok) {
          throw new Error(`MJPEG 请求失败: ${response.status} ${response.statusText}`)
        }
        const boundary = extractBoundary(response.headers.get('content-type'))
        if (!response.body || !boundary) {
          throw new Error('MJPEG boundary 缺失，无法解析流')
        }

        for await (const blob of parseMjpegStream(response.body, boundary)) {
          if (!useCanvasRenderer.value || signal.aborted) break
          clearLatestFrame()
          const bitmap = await createImageBitmap(blob)
          latestFrame.value = bitmap
        }
      } catch (err) {
        if (!signal.aborted) {
          const errMsg = `MJPEG Canvas 渲染失败: ${err instanceof Error ? err.message : String(err)}`
          error.value = errMsg
          console.error('[iOS MJPEG]', errMsg)
          canvasFailed.value = true
        }
      } finally {
        stopRenderLoop()
        clearLatestFrame()
        streamTask = null
        streamAbort = null
      }
    })()
  }

  function stopCanvasRenderer() {
    if (streamAbort) {
      streamAbort.abort()
    }
    stopRenderLoop()
  }

  async function startStream() {
    if (isStreaming.value) {
      console.log('[iOS MJPEG] Stream already started')
      return
    }

    try {
      console.log('[iOS MJPEG] Starting WDA MJPEG stream...')
      await sendCommand(platform.value, serial.value, 'start_mjpeg_stream', {})

      isStreaming.value = true
      error.value = null
      resetFps()
      canvasFailed.value = false

      console.log('[iOS MJPEG] Stream started:', mjpegUrl.value)
      if (useCanvasRenderer.value) {
        startCanvasRenderer()
      }
    } catch (err) {
      const errMsg = `Failed to start iOS MJPEG stream: ${err instanceof Error ? err.message : String(err)}`
      error.value = errMsg
      console.error('[iOS MJPEG]', errMsg, err)
    }
  }

  async function stopStream() {
    if (!isStreaming.value) {
      return
    }

    try {
      console.log('[iOS MJPEG] Stopping MJPEG stream...')
      stopCanvasRenderer()
      await sendCommand(platform.value, serial.value, 'stop_mjpeg_stream', {})

      isStreaming.value = false
      resetFps()

      console.log('[iOS MJPEG] Stream stopped')
    } catch (err) {
      const errMsg = `Failed to stop iOS MJPEG stream: ${err instanceof Error ? err.message : String(err)}`
      error.value = errMsg
      console.error('[iOS MJPEG]', errMsg, err)
    }
  }

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

  watch(
    () => useCanvasRenderer.value && isStreaming.value,
    (shouldRender) => {
      if (shouldRender) {
        startCanvasRenderer()
      } else {
        stopCanvasRenderer()
      }
    }
  )

  onScopeDispose(() => {
    // 同步清理渲染循环和帧资源
    stopCanvasRenderer()
    // 异步停止流，不阻塞销毁过程
    if (isStreaming.value) {
      stopStream().catch((err) => {
        console.warn('[iOS MJPEG] Cleanup error:', err)
      })
    }
  })

  return {
    streamUrl: mjpegUrl,
    isStreaming,
    error,
    fps,
    updateFps: recordFrame,
    useCanvasRenderer,
    canvasRef,
    startStream,
    stopStream,
  }
}
