import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed } from 'vue'
import type { Platform } from '@/api/types'
import { useRecorder } from '@/composables/useRecorder'
import { downloadJSON } from '@/utils/download'

vi.mock('@/utils/download', () => ({
  downloadJSON: vi.fn(),
}))

const downloadJSONMock = vi.mocked(downloadJSON)

function mockFilePicker(file: { text: () => Promise<string> } | null) {
  const input: any = {
    type: '',
    accept: '',
    files: file ? [file] : [],
    onchange: null,
    click: vi.fn(() => {
      void input.onchange?.()
    }),
  }

  const documentMock = {
    createElement: vi.fn(() => input),
  }

  ;(globalThis as any).document = documentMock
  return { input, documentMock }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
  downloadJSONMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  // 避免泄漏到其它测试
  delete (globalThis as any).document
})

describe('useRecorder', () => {
  function createRecorder(screen: { width: number; height: number } = { width: 100, height: 200 }) {
    const screenSize = computed(() => screen)
    return useRecorder('android' as Platform, 'serial-1', screenSize)
  }

  it('未开始或暂停时不录制', async () => {
    const recorder = createRecorder()

    await recorder.recordTap(10, 20)
    expect(recorder.actions.value).toHaveLength(0)

    recorder.start('r1')
    recorder.pause()
    await recorder.recordTap(10, 20)
    expect(recorder.actions.value).toHaveLength(0)

    recorder.resume()
    await recorder.recordTap(10, 20)
    expect(recorder.actions.value).toHaveLength(1)

    recorder.clear()
    expect(recorder.actions.value).toHaveLength(0)
    expect(recorder.exportRecording().createdAt).toBe(0)
  })

  it('新录制操作默认失败行为为 stop，且全局开关默认关闭', async () => {
    const recorder = createRecorder()
    recorder.start()

    await recorder.recordTap(10, 20)
    recorder.config.value.captureScreenshots = true
    await recorder.recordSwipe(1, 2, 3, 4, 0.5)
    await recorder.recordAssert({ operator: 'and', conditions: [] })
    await recorder.recordSleep(123)
    await recorder.recordCommand('home')

    expect(recorder.config.value.globalFailureControl).toEqual({
      enabled: false,
      onExecuteFailure: 'stop',
      onAssertFailure: 'stop',
    })

    for (const action of recorder.actions.value) {
      expect(action.onExecuteFailure).toBe('stop')
      expect(action.onAssertFailure).toBe('stop')
    }
  })

  it('tap 支持 xpath/element 记录，并受 recordElementDetails 控制', async () => {
    const recorder = createRecorder()
    recorder.start()

    const node: any = {
      key: 'k1',
      xpath: '//App/Button[1]',
      text: 'OK',
      label: 'OK',
      resource_id: 'id.ok',
      class_name: 'Button',
      content_desc: 'desc',
      bounds: [1, 2, 3, 4],
    }

    await recorder.recordTap(10, 20, node)
    const withDetails = recorder.actions.value[0] as any
    expect(withDetails.xpath).toEqual({ selector: node.xpath, fallbackCoords: { x: 10, y: 20 } })
    expect(withDetails.element).toMatchObject({
      text: 'OK',
      label: 'OK',
      resource_id: 'id.ok',
      class_name: 'Button',
      content_desc: 'desc',
      bounds: [1, 2, 3, 4],
      key: 'k1',
    })

    recorder.config.value.recordElementDetails = false
    await recorder.recordTap(11, 21, node)
    const withoutDetails = recorder.actions.value[1] as any
    expect(withoutDetails.element).toBeUndefined()

    await recorder.recordTap(12, 22, { ...node, xpath: undefined })
    const withoutXpath = recorder.actions.value[2] as any
    expect(withoutXpath.xpath).toBeUndefined()
  })

  it('会根据相邻操作时间更新上一条的 waitAfter', async () => {
    const recorder = createRecorder()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
    recorder.start()

    await recorder.recordTap(1, 2)
    expect(recorder.actions.value[0]?.waitAfter).toBe(0)

    vi.setSystemTime(new Date('2025-01-01T00:00:01.500Z'))
    await recorder.recordInput('hello')

    expect(recorder.actions.value[0]?.waitAfter).toBe(1500)
    expect(recorder.actions.value[1]?.relativeTime).toBe(1500)
  })

  it('非录制状态下 recordAssert 走编辑模式并补齐 waitAfter/relativeTime', async () => {
    const recorder = createRecorder()
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
    recorder.start()
    await recorder.recordTap(1, 2)
    recorder.stop()

    await recorder.recordAssert({ operator: 'and', conditions: [] })

    expect(recorder.actions.value).toHaveLength(2)
    expect(recorder.actions.value[0]?.waitAfter).toBe(1000)
    expect((recorder.actions.value[1] as any).type).toBe('assert')
    expect(recorder.actions.value[1]?.relativeTime).toBe(1000)
  })

  it('无历史操作时 recordAssert 在编辑模式下 relativeTime 为 0', async () => {
    const recorder = createRecorder()
    await recorder.recordAssert({ operator: 'and', conditions: [] })
    expect(recorder.actions.value).toHaveLength(1)
    expect(recorder.actions.value[0]?.relativeTime).toBe(0)
  })

  it('updateAction 禁止修改不可变字段，并会规范化失败行为', async () => {
    const recorder = createRecorder()
    recorder.start()
    await recorder.recordTap(1, 2)

    const [first] = recorder.actions.value
    expect(first).toBeTruthy()

    expect(recorder.updateAction('missing', { waitAfter: 10 } as any)).toBe(false)

    expect(() => recorder.updateAction(first!.id, { type: 'sleep' } as any)).toThrow('Cannot change action type')
    expect(() => recorder.updateAction(first!.id, { id: 'new-id' } as any)).toThrow('Cannot change action id')
    expect(() =>
      recorder.updateAction(first!.id, { timestamp: first!.timestamp + 1 } as any)
    ).toThrow('Cannot change action timestamp')

    expect(
      recorder.updateAction(first!.id, { waitAfter: 42, onExecuteFailure: 'continue', onAssertFailure: 'nope' } as any)
    ).toBe(true)

    const updated = recorder.actions.value[0]!
    expect(updated.waitAfter).toBe(42)
    expect(updated.onExecuteFailure).toBe('continue')
    expect(updated.onAssertFailure).toBe('stop')

    recorder.deleteAction(updated.id)
    expect(recorder.actions.value).toHaveLength(0)
    recorder.deleteAction('missing')
    expect(recorder.actions.value).toHaveLength(0)
  })

  it('reorderActions 基于 waitAfter 重新计算 relativeTime', async () => {
    const recorder = createRecorder()
    recorder.start()
    await recorder.recordTap(1, 2)
    await recorder.recordInput('x')

    const [a1, a2] = recorder.actions.value
    recorder.reorderActions([a2!, a1!])

    expect(recorder.actions.value[0]?.relativeTime).toBe(0)
    // waitAfter 为 0 时走默认 500ms
    expect(recorder.actions.value[1]?.relativeTime).toBe(500)
  })

  it('exportRecording 生成完整 RecordingFile，并支持自定义名称', async () => {
    const recorder = createRecorder({ width: 300, height: 400 })
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))
    recorder.start('orig')

    await recorder.recordTap(1, 2)
    vi.setSystemTime(new Date('2025-01-01T00:00:02.000Z'))
    await recorder.recordSleep(100)

    const file = recorder.exportRecording('custom')
    expect(file.version).toBe('1.0')
    expect(file.name).toBe('custom')
    expect(file.platform).toBe('android')
    expect(file.deviceInfo).toEqual({ serial: 'serial-1', screenWidth: 300, screenHeight: 400 })
    expect(file.config.globalFailureControl).toEqual({
      enabled: false,
      onExecuteFailure: 'stop',
      onAssertFailure: 'stop',
    })
    expect(file.actions).toHaveLength(2)
    expect(file.duration).toBe(2000)
  })

  it('importRecording 对旧数据补齐失败控制默认值，并对 config 缺失字段回填默认值', () => {
    const recorder = createRecorder()

    const legacy: any = {
      version: '1.0',
      name: 'legacy',
      platform: 'android',
      deviceInfo: { serial: 's', screenWidth: 100, screenHeight: 200 },
      createdAt: 'not-a-number',
      updatedAt: 0,
      duration: 0,
      config: {
        captureScreenshots: true,
        screenshotQuality: 0.1,
        recordElementDetails: false,
      },
      actions: [
        {
          id: 'a1',
          type: 'tap',
          timestamp: 0,
          relativeTime: 0,
          waitAfter: 0,
          coords: { x: 1, y: 2, scaleX: 0.01, scaleY: 0.02 },
          params: { x: 1, y: 2 },
          onExecuteFailure: 'bad-value',
        },
      ],
    }

    recorder.importRecording(legacy)
    expect(recorder.actions.value[0]?.onExecuteFailure).toBe('stop')
    expect(recorder.actions.value[0]?.onAssertFailure).toBe('stop')
    expect(recorder.config.value.globalFailureControl).toEqual({
      enabled: false,
      onExecuteFailure: 'stop',
      onAssertFailure: 'stop',
    })

    const exported = recorder.exportRecording()
    expect(exported.createdAt).toBe(0)
  })

  it('saveToFile 调用 downloadJSON 下载 .byteautoui 文件', async () => {
    const recorder = createRecorder()
    recorder.start('r1')
    await recorder.recordTap(1, 2)

    recorder.saveToFile()

    expect(downloadJSONMock).toHaveBeenCalledTimes(1)
    const [data, filename] = downloadJSONMock.mock.calls[0]!
    expect(filename).toBe('r1.byteautoui')
    expect((data as any).version).toBe('1.0')
    expect((data as any).actions).toHaveLength(1)
  })

  it('loadFromFile 覆盖 validateRecordingFile 的成功与失败分支', async () => {
    const recorder = createRecorder()

    // 成功路径：最小合法文件 + 旧字段缺失
    const okFile: any = {
      version: '1.0',
      name: 'ok',
      platform: 'android',
      deviceInfo: { serial: 's', screenWidth: 100, screenHeight: 200 },
      createdAt: 0,
      updatedAt: 0,
      duration: 0,
      config: { captureScreenshots: false, screenshotQuality: 0.6, recordElementDetails: true },
      actions: [
        {
          id: 'a1',
          type: 'tap',
          timestamp: 0,
          relativeTime: 0,
          waitAfter: 0,
          coords: { x: 1, y: 2, scaleX: 0.01, scaleY: 0.02 },
          params: { x: 1, y: 2 },
        },
      ],
    }

    mockFilePicker({ text: async () => JSON.stringify(okFile) })
    const loaded = await recorder.loadFromFile()
    expect(loaded.name).toBe('ok')
    expect(recorder.actions.value[0]?.onExecuteFailure).toBe('stop')
    expect(recorder.actions.value[0]?.onAssertFailure).toBe('stop')

    // 失败：未选择文件
    mockFilePicker(null)
    await expect(recorder.loadFromFile()).rejects.toThrow('未选择文件')

    // 失败：无效 JSON
    mockFilePicker({ text: async () => '{invalid json' })
    await expect(recorder.loadFromFile()).rejects.toThrow('文件格式错误：无效的JSON')

    // 失败：非 SyntaxError（走 reject(error)）
    const boom = new Error('boom')
    mockFilePicker({
      text: async () => {
        throw boom
      },
    })
    await expect(recorder.loadFromFile()).rejects.toThrow('boom')

    // 失败：validateRecordingFile 返回 false（触发多个分支）
    const invalidCases: any[] = [
      null,
      { version: '2.0' },
      { version: '1.0', name: 1 },
      { version: '1.0', name: 'x', platform: 'win' },
      { version: '1.0', name: 'x', platform: 'android', deviceInfo: null, actions: [] },
      { version: '1.0', name: 'x', platform: 'android', deviceInfo: { screenWidth: 1, screenHeight: 1 }, actions: {} },
      {
        version: '1.0',
        name: 'x',
        platform: 'android',
        deviceInfo: { screenWidth: 1, screenHeight: 1 },
        actions: [{}],
      },
      {
        version: '1.0',
        name: 'x',
        platform: 'android',
        deviceInfo: { screenWidth: 1, screenHeight: 1 },
        actions: [null],
      },
      {
        version: '1.0',
        name: 'x',
        platform: 'android',
        deviceInfo: { screenWidth: 1, screenHeight: 1 },
        actions: [{ type: 'tap' }],
      },
      {
        version: '1.0',
        name: 'x',
        platform: 'android',
        deviceInfo: { screenWidth: 1, screenHeight: 1 },
        actions: [{ type: 'tap', timestamp: 0, relativeTime: 0 }],
      },
      {
        version: '1.0',
        name: 'x',
        platform: 'android',
        deviceInfo: { screenWidth: 1, screenHeight: 1 },
        actions: [{ type: 'swipe', timestamp: 0, relativeTime: 0, coords: { x: 1 }, params: {} }],
      },
    ]

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const data of invalidCases) {
      mockFilePicker({ text: async () => JSON.stringify(data) })
      await expect(recorder.loadFromFile()).rejects.toThrow('文件格式验证失败')
    }
    errorSpy.mockRestore()
  })

  it('createCoordinateInfo 会拒绝无效屏幕尺寸', async () => {
    const recorder = createRecorder({ width: 0, height: 0 })
    recorder.start()
    await expect(recorder.recordTap(1, 2)).rejects.toThrow('Invalid screen size')
  })
})
