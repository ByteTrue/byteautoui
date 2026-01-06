import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed } from 'vue'
import type { Platform } from '@/api/types'
import { usePlayer } from '@/composables/usePlayer'
import type { RecordingFile, RecordedAction } from '@/types/recording'
import { tap, sendCommand, getHierarchy, assertCombined } from '@/api'

vi.mock('@/api', () => ({
  tap: vi.fn(),
  sendCommand: vi.fn(),
  getHierarchy: vi.fn(),
  assertCombined: vi.fn(),
}))

const tapMock = vi.mocked(tap)
const sendCommandMock = vi.mocked(sendCommand)
const getHierarchyMock = vi.mocked(getHierarchy)
const assertCombinedMock = vi.mocked(assertCombined)

function createPlayer(screen: { width: number; height: number } = { width: 100, height: 200 }) {
  const screenSize = computed(() => screen)
  return usePlayer('android' as Platform, 'serial-1', screenSize)
}

function baseAction(id: string, overrides: Partial<RecordedAction> = {}): any {
  return {
    id,
    timestamp: 0,
    relativeTime: 0,
    waitAfter: 0,
    onExecuteFailure: 'stop',
    onAssertFailure: 'stop',
    ...overrides,
  }
}

function createRecording(actions: any[], overrides: Partial<RecordingFile> = {}): RecordingFile {
  return {
    version: '1.0',
    name: 'r1',
    platform: 'android',
    deviceInfo: { serial: 'serial-1', screenWidth: 100, screenHeight: 200 },
    createdAt: 0,
    updatedAt: 0,
    duration: 0,
    config: {
      captureScreenshots: false,
      screenshotQuality: 0.6,
      recordElementDetails: true,
      globalFailureControl: {
        enabled: false,
        onExecuteFailure: 'stop',
        onAssertFailure: 'stop',
      },
    },
    actions: actions as RecordedAction[],
    ...overrides,
  }
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'))

  tapMock.mockReset().mockResolvedValue(undefined)
  sendCommandMock.mockReset().mockResolvedValue(undefined)
  getHierarchyMock.mockReset().mockResolvedValue({ nodes: [] } as any)
  assertCombinedMock.mockReset().mockResolvedValue({ success: true, message: 'ok' } as any)

  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
  logSpy.mockRestore()
})

describe('usePlayer', () => {
  it('load/unload 会补齐全局配置与步骤失败字段', () => {
    const player = createPlayer()

    expect(player.canPlay.value).toBe(false)
    expect(player.progress.value.totalSteps).toBe(0)

    const legacyTap: any = {
      id: 'a1',
      type: 'tap',
      timestamp: 0,
      relativeTime: 0,
      waitAfter: 0,
      coords: { x: 1, y: 2, scaleX: 0.01, scaleY: 0.02 },
      params: { x: 1, y: 2 },
    }

    const file: any = createRecording([legacyTap], {
      config: {
        captureScreenshots: false,
        screenshotQuality: 0.6,
        recordElementDetails: true,
      } as any,
    })

    player.load(file)
    expect(player.canPlay.value).toBe(true)
    expect(player.progress.value.totalSteps).toBe(1)
    expect(player.globalFailureControl.value).toEqual({
      enabled: false,
      onExecuteFailure: 'stop',
      onAssertFailure: 'stop',
    })
    expect(player.recording.value?.actions[0]?.onExecuteFailure).toBe('stop')
    expect(player.recording.value?.actions[0]?.onAssertFailure).toBe('stop')

    player.unload()
    expect(player.canPlay.value).toBe(false)
  })

  it('tap 按比例坐标缩放并回放成功', async () => {
    const player = createPlayer({ width: 100, height: 200 })
    const action = {
      ...baseAction('tap-1'),
      type: 'tap',
      coords: { x: 0, y: 0, scaleX: 0.5, scaleY: 0.25 },
      params: { x: 0, y: 0 },
    }
    player.load(createRecording([action]))

    await player.play()

    expect(tapMock).toHaveBeenCalledWith('android', 'serial-1', 50, 50)
    expect(player.state.value).toBe('idle')
    expect(player.currentIndex.value).toBe(-1)
    expect(player.getStepResult('tap-1')?.status).toBe('success')
  })

  it('无效屏幕尺寸会触发执行失败并停止', async () => {
    const player = createPlayer({ width: 0, height: 0 })
    const action = {
      ...baseAction('tap-1'),
      type: 'tap',
      coords: { x: 0, y: 0, scaleX: 0.5, scaleY: 0.25 },
      params: { x: 0, y: 0 },
    }
    player.load(createRecording([action]))

    await player.play()

    expect(player.state.value).toBe('error')
    expect(player.error.value).toContain('屏幕尺寸无效')
    expect(player.getStepResult('tap-1')?.status).toBe('failed')
  })

  it('tap 支持 xpath 定位成功/失败降级坐标', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    getHierarchyMock.mockResolvedValueOnce({
      nodes: [
        {
          xpath: '//App/Button[1]',
          bounds: [0, 0, 10, 20],
          children: [],
        },
      ],
    } as any)

    const xpathTap = {
      ...baseAction('tap-xpath'),
      type: 'tap',
      xpath: { selector: '//App/Button[1]', fallbackCoords: { x: 1, y: 2 } },
      coords: { x: 1, y: 2, scaleX: 0.01, scaleY: 0.01 },
      params: { x: 1, y: 2 },
    }

    // getHierarchy 抛错 -> findElementByXPath catch -> 降级走 coords
    getHierarchyMock.mockRejectedValueOnce(new Error('hierarchy-down'))
    const fallbackTap = {
      ...baseAction('tap-fallback'),
      type: 'tap',
      xpath: { selector: '//Missing', fallbackCoords: { x: 20, y: 30 } },
      coords: { x: 20, y: 30, scaleX: 0.2, scaleY: 0.15 },
      params: { x: 20, y: 30 },
    }

    player.load(createRecording([xpathTap, fallbackTap]))
    await player.play()

    expect(tapMock).toHaveBeenNthCalledWith(1, 'android', 'serial-1', 5, 10)
    expect(tapMock).toHaveBeenNthCalledWith(2, 'android', 'serial-1', 20, 30)
  })

  it('swipe/input/sleep/back/home/command/assert/default 分支跑通', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    const swipe = {
      ...baseAction('sw1'),
      type: 'swipe',
      coords: { x: 0, y: 0, scaleX: 0.1, scaleY: 0.2 },
      endCoords: { x: 0, y: 0, scaleX: 0.3, scaleY: 0.4 },
      params: {}, // 覆盖 duration 默认值分支
    }

    const input = {
      ...baseAction('in1', { waitAfter: 10 }),
      type: 'input',
      params: { text: 'hello' },
    }

    const sleep = {
      ...baseAction('sl1'),
      type: 'sleep',
      params: { duration: 50 },
    }

    const back = {
      ...baseAction('bk1'),
      type: 'back',
      params: { command: 'back' },
    }

    const home = {
      ...baseAction('hm1'),
      type: 'home',
      params: { command: 'home' },
    }

    const commandNoArgs = {
      ...baseAction('cmd1'),
      type: 'command',
      params: { command: 'noop' },
    }

    const commandWithArgs = {
      ...baseAction('cmd2'),
      type: 'command',
      params: { command: 'setText', args: { x: 1 } },
    }

    const assertOk = {
      ...baseAction('as1'),
      type: 'assert',
      params: { operator: 'and', conditions: [] },
    }

    const unknown: any = {
      ...baseAction('u1'),
      type: 'unknown',
      params: {},
    }

    player.load(createRecording([swipe, input, sleep, back, home, commandNoArgs, commandWithArgs, assertOk, unknown]))

    const playPromise = player.play()
    await vi.runAllTimersAsync()
    await playPromise

    expect(sendCommandMock).toHaveBeenCalledTimes(6)
    expect(sendCommandMock).toHaveBeenCalledWith('android', 'serial-1', 'swipe', {
      startX: 10,
      startY: 40,
      endX: 30,
      endY: 80,
      duration: 0.5,
    })
    expect(sendCommandMock).toHaveBeenCalledWith('android', 'serial-1', 'sendKeys', { text: 'hello' })
    expect(sendCommandMock).toHaveBeenCalledWith('android', 'serial-1', 'back', {})
    expect(sendCommandMock).toHaveBeenCalledWith('android', 'serial-1', 'home', {})
    expect(sendCommandMock).toHaveBeenCalledWith('android', 'serial-1', 'noop', {})
    expect(sendCommandMock).toHaveBeenCalledWith('android', 'serial-1', 'setText', { x: 1 })
    expect(assertCombinedMock).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('未知操作类型')
    expect(player.state.value).toBe('idle')
  })

  it('失败策略：执行失败/断言失败按 continue/stop 处理，且全局开关优先', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    // 1) 执行失败：tap 失败，全局 continue 覆盖步骤 stop
    tapMock.mockRejectedValueOnce(new Error('tap-fail'))
    const execFail = {
      ...baseAction('e1', { onExecuteFailure: 'stop' }),
      type: 'tap',
      coords: { x: 0, y: 0, scaleX: 0.1, scaleY: 0.1 },
      params: { x: 0, y: 0 },
    }
    const execAfter = {
      ...baseAction('e2'),
      type: 'command',
      params: { command: 'after-exec-fail' },
    }

    const file1 = createRecording([execFail, execAfter])
    file1.config.globalFailureControl = { enabled: true, onExecuteFailure: 'continue', onAssertFailure: 'stop' }
    player.load(file1)

    await player.play()
    expect(player.state.value).toBe('idle')
    expect(player.error.value).toBeNull()
    expect(player.getStepResult('e1')?.status).toBe('failed')
    expect(player.getStepResult('e2')?.status).toBe('success')
    expect(sendCommandMock).toHaveBeenCalledWith('android', 'serial-1', 'after-exec-fail', {})

    // 2) 断言失败：全局 stop 覆盖步骤 continue，并会输出失败截图
    assertCombinedMock.mockResolvedValueOnce({
      success: false,
      message: 'no',
      screenshot: 'abcd',
      details: { why: 'no' },
    } as any)

    const assertFail = {
      ...baseAction('a1', { onAssertFailure: 'continue' }),
      type: 'assert',
      params: { operator: 'and', conditions: [] },
    }
    const assertAfter = {
      ...baseAction('a2'),
      type: 'command',
      params: { command: 'after-assert-fail' },
    }

    const file2 = createRecording([assertFail, assertAfter])
    file2.config.globalFailureControl = { enabled: true, onExecuteFailure: 'stop', onAssertFailure: 'stop' }
    player.load(file2)

    await player.play()
    expect(player.state.value).toBe('error')
    expect(player.error.value).toBe('断言失败: no')
    expect(player.getStepResult('a1')?.status).toBe('failed')
    expect(player.getStepResult('a2')).toBeUndefined()
    expect(logSpy).toHaveBeenCalledWith('失败截图:', 'data:image/jpeg;base64,abcd')
  })

  it('断言 API 抛错属于执行失败，应使用 onExecuteFailure', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    assertCombinedMock.mockRejectedValueOnce(new Error('api-down'))
    const assertAction = {
      ...baseAction('as-err', { onExecuteFailure: 'continue', onAssertFailure: 'stop' }),
      type: 'assert',
      params: { operator: 'and', conditions: [] },
    }
    const after = {
      ...baseAction('after'),
      type: 'command',
      params: { command: 'after' },
    }

    player.load(createRecording([assertAction, after]))
    await player.play()

    expect(player.state.value).toBe('idle')
    expect(player.getStepResult('as-err')?.status).toBe('failed')
    expect(player.getStepResult('after')?.status).toBe('success')
  })

  it('updateGlobalFailureControl 会写回 recording.config', () => {
    const player = createPlayer()
    player.load(createRecording([]))

    player.updateGlobalFailureControl({ enabled: true, onExecuteFailure: 'continue' })
    expect(player.recording.value?.config.globalFailureControl).toEqual({
      enabled: true,
      onExecuteFailure: 'continue',
      onAssertFailure: 'stop',
    })
  })

  it('pause/stop/seekTo/stepNext/setSpeed 分支覆盖', async () => {
    const player = createPlayer()
    const actions = [
      { ...baseAction('c1'), type: 'command', params: { command: 'c1' } },
      { ...baseAction('c2'), type: 'command', params: { command: 'c2' } },
    ]
    player.load(createRecording(actions))

    player.seekTo(1)
    expect(player.state.value).toBe('paused')
    expect(player.currentIndex.value).toBe(1)
    player.seekTo(999)
    expect(player.currentIndex.value).toBe(1)

    player.setSpeed(-10)
    expect(player.speed.value).toBe(0.1)
    player.setSpeed(10)
    expect(player.speed.value).toBe(5)

    // stepNext：从暂停位置执行下一步（不会越界）
    player.seekTo(0)
    await player.stepNext()
    expect(player.currentIndex.value).toBe(1)

    // pause 只有 playing -> paused 生效
    void player.play()
    player.pause()
    expect(player.state.value).toBe('paused')

    player.stop()
    expect(player.state.value).toBe('stopped')
    expect(player.currentIndex.value).toBe(-1)
    expect(player.error.value).toBeNull()
  })

  it('未加载录制时 play 会给出错误', async () => {
    const player = createPlayer()
    await player.play()
    expect(player.error.value).toBe('没有可回放的录制')
  })
})

