import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { Platform } from '@/api/types'
import { useMjpeg } from '@/composables/useMjpeg'
import { sendCommand } from '@/api'
import { parseMjpegStream, extractBoundary } from '@/utils/mjpegStreamParser'

vi.mock('@/api', () => ({
  sendCommand: vi.fn(),
}))

vi.mock('@/utils/mjpegStreamParser', () => ({
  parseMjpegStream: vi.fn(),
  extractBoundary: vi.fn(),
}))

const sendCommandMock = vi.mocked(sendCommand)
const parseMjpegStreamMock = vi.mocked(parseMjpegStream)
const extractBoundaryMock = vi.mocked(extractBoundary)

const RAF_INTERVAL = 17

function createMockCanvas() {
  let width = 0
  let height = 0

  const drawImageMock = vi.fn()
  const ctx = { drawImage: drawImageMock } as unknown as CanvasRenderingContext2D
  const canvas: any = {
    getContext: vi.fn(() => ctx),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: width || 200,
      height: height || 100,
      right: 0,
      bottom: 0,
    }),
  }

  Object.defineProperty(canvas, 'width', {
    get: () => width,
    set: (v: number) => {
      width = v
    },
  })

  Object.defineProperty(canvas, 'height', {
    get: () => height,
    set: (v: number) => {
      height = v
    },
  })

  return { canvas: canvas as HTMLCanvasElement, ctx, drawImageMock }
}

function createFrameStream(count: number, delayMs: number) {
  return (async function* () {
    for (let i = 0; i < count; i++) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
      yield new Blob([`frame-${i}`], { type: 'image/jpeg' })
    }
  })()
}

function buildResponse() {
  return new Response(new ReadableStream(), {
    headers: { 'content-type': 'multipart/x-mixed-replace; boundary=boundary' },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  sendCommandMock.mockResolvedValue(undefined)
  parseMjpegStreamMock.mockReset()
  extractBoundaryMock.mockReturnValue('boundary')
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now())

  global.fetch = vi.fn().mockResolvedValue(buildResponse()) as unknown as typeof fetch

  global.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), RAF_INTERVAL) as unknown as number) as typeof requestAnimationFrame
  global.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame

  global.createImageBitmap = vi.fn(async () => ({
    width: 120,
    height: 80,
    close: vi.fn(),
  })) as unknown as typeof createImageBitmap
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllTimers()
  vi.resetAllMocks()
})

describe('useMjpeg canvas renderer', () => {
  it('caps rendering to 30fps and drops intermediate frames', async () => {
    parseMjpegStreamMock.mockReturnValue(createFrameStream(20, 5))

    const platform = ref('ios' as Platform)
    const serial = ref('serial')
    const enabled = ref(false)
    const canvasRef = ref<HTMLCanvasElement | null>(null)
    const { canvas, drawImageMock } = createMockCanvas()
    canvasRef.value = canvas

    const scope = effectScope()
    let mjpeg: ReturnType<typeof useMjpeg> | null = null

    scope.run(() => {
      mjpeg = useMjpeg({
        platform,
        serial,
        enabled,
        canvasRef,
        preferCanvas: true,
      })
    })

    await mjpeg!.startStream()
    await vi.advanceTimersByTimeAsync(250)

    expect(sendCommandMock).toHaveBeenCalledWith(platform.value, serial.value, 'start_mjpeg_stream', {})
    expect(drawImageMock).toHaveBeenCalled()
    expect(drawImageMock.mock.calls.length).toBeLessThan(20) // 丢帧
    expect(mjpeg!.fps.value).toBeGreaterThanOrEqual(28)
    expect(mjpeg!.fps.value).toBeLessThanOrEqual(32)

    await mjpeg!.stopStream()
    scope.stop()
  })

  it('falls back to <img> path when canvas renderer is unavailable', async () => {
    const originalReadable = global.ReadableStream
    // 模拟浏览器不支持 ReadableStream
    // @ts-expect-error - force unsupported
    global.ReadableStream = undefined

    const platform = ref('ios' as Platform)
    const serial = ref('serial')
    const enabled = ref(false)

    const scope = effectScope()
    let mjpeg: ReturnType<typeof useMjpeg> | null = null
    scope.run(() => {
      mjpeg = useMjpeg({
        platform,
        serial,
        enabled,
        preferCanvas: true,
      })
    })

    await mjpeg!.startStream()

    mjpeg!.updateFps(0)
    mjpeg!.updateFps(33)
    mjpeg!.updateFps(66)

    expect(mjpeg!.useCanvasRenderer.value).toBe(false)
    expect((global.fetch as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect(mjpeg!.streamUrl.value).not.toBeNull()
    expect(mjpeg!.fps.value).toBeGreaterThanOrEqual(29)
    expect(mjpeg!.fps.value).toBeLessThanOrEqual(31)

    await mjpeg!.stopStream()
    scope.stop()
    global.ReadableStream = originalReadable
  })

  it('marks canvas renderer as failed when boundary is missing', async () => {
    extractBoundaryMock.mockReturnValue(null)
    parseMjpegStreamMock.mockReturnValue(createFrameStream(2, 5))

    const { canvas } = createMockCanvas()
    const platform = ref('ios' as Platform)
    const serial = ref('serial')
    const enabled = ref(false)
    const canvasRef = ref<HTMLCanvasElement | null>(canvas)

    const scope = effectScope()
    let mjpeg: ReturnType<typeof useMjpeg> | null = null
    scope.run(() => {
      mjpeg = useMjpeg({
        platform,
        serial,
        enabled,
        canvasRef,
        preferCanvas: true,
      })
    })

    await mjpeg!.startStream()
    await vi.runAllTimersAsync()

    expect(mjpeg!.error.value).toContain('MJPEG Canvas 渲染失败')
    expect(mjpeg!.useCanvasRenderer.value).toBe(false)
    expect(parseMjpegStreamMock).not.toHaveBeenCalled()
    await mjpeg!.stopStream()
    scope.stop()
  })

  it('reacts to enabled toggle and cleans up on scope dispose', async () => {
    const platform = ref('ios' as Platform)
    const serial = ref('serial')
    const enabled = ref(true)

    const scope = effectScope()
    let mjpeg: ReturnType<typeof useMjpeg> | null = null

    scope.run(() => {
      mjpeg = useMjpeg({
        platform,
        serial,
        enabled,
        preferCanvas: false,
      })
    })

    await nextTick()
    expect(sendCommandMock).toHaveBeenCalledWith(platform.value, serial.value, 'start_mjpeg_stream', {})

    enabled.value = false
    await nextTick()
    expect(sendCommandMock).toHaveBeenCalledWith(platform.value, serial.value, 'stop_mjpeg_stream', {})

    scope.stop()
    expect(mjpeg!.isStreaming.value).toBe(false)
  })

  it('reports error when startStream fails', async () => {
    sendCommandMock.mockRejectedValueOnce(new Error('boom'))

    const platform = ref('ios' as Platform)
    const serial = ref('serial')
    const enabled = ref(false)

    const scope = effectScope()
    let mjpeg: ReturnType<typeof useMjpeg> | null = null
    scope.run(() => {
      mjpeg = useMjpeg({
        platform,
        serial,
        enabled,
        preferCanvas: false,
      })
    })

    await mjpeg!.startStream()

    expect(mjpeg!.error.value).toContain('Failed to start iOS MJPEG stream')
    expect(mjpeg!.isStreaming.value).toBe(false)

    scope.stop()
  })

  it('reports error when stopStream fails', async () => {
    sendCommandMock.mockResolvedValueOnce(undefined)
    sendCommandMock.mockRejectedValueOnce(new Error('stop boom'))

    const platform = ref('ios' as Platform)
    const serial = ref('serial')
    const enabled = ref(false)

    const scope = effectScope()
    let mjpeg: ReturnType<typeof useMjpeg> | null = null
    scope.run(() => {
      mjpeg = useMjpeg({
        platform,
        serial,
        enabled,
        preferCanvas: false,
      })
    })

    await mjpeg!.startStream()
    expect(mjpeg!.isStreaming.value).toBe(true)

    await mjpeg!.stopStream()
    expect(mjpeg!.error.value).toContain('Failed to stop iOS MJPEG stream')

    mjpeg!.isStreaming.value = false
    scope.stop()
  })
})
