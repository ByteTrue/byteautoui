import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed } from 'vue'
import type { Platform } from '@/api/types'
import { usePlayer } from '@/composables/usePlayer'
import type { RecordingFile, RecordedAction } from '@/types/recording'
import { tap, sendCommand, assertCombined } from '@/api'

vi.mock('@/api', () => ({
  tap: vi.fn(),
  sendCommand: vi.fn(),
  assertCombined: vi.fn(),
}))

const tapMock = vi.mocked(tap)
const sendCommandMock = vi.mocked(sendCommand)
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
    onFailure: 'stop',
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
        onFailure: 'stop',
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
      onFailure: 'stop',
    })
    expect(player.recording.value?.actions[0]?.onFailure).toBe('stop')

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

  it('tap xpath 使用后端 clickElement API，失败即失败', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    // 1) XPath 成功：后端 clickElement 返回成功
    sendCommandMock.mockResolvedValueOnce(undefined)

    const successTap = {
      ...baseAction('tap-success'),
      type: 'tap',
      xpath: { selector: '//button[@text="Submit"]' },
      params: { x: 1, y: 2 },
    }

    // 2) XPath 失败：直接抛出错误，不降级坐标
    sendCommandMock.mockRejectedValueOnce(new Error('element not found'))

    const failedTap = {
      ...baseAction('tap-failed'),
      type: 'tap',
      xpath: { selector: '//missing' },
      params: { x: 20, y: 30 },
    }

    player.load(createRecording([successTap, failedTap]))
    await player.play()

    // 第一个步骤成功（调用 clickElement）
    expect(sendCommandMock).toHaveBeenNthCalledWith(1, 'android', 'serial-1', 'clickElement', {
      by: 'xpath',
      value: '//button[@text="Submit"]',
      timeout: 3,
    })
    expect(player.getStepResult('tap-success')?.status).toBe('success')

    // 第二个步骤失败（XPath 失败，直接报错）
    expect(sendCommandMock).toHaveBeenNthCalledWith(2, 'android', 'serial-1', 'clickElement', {
      by: 'xpath',
      value: '//missing',
      timeout: 3,
    })
    expect(player.getStepResult('tap-failed')?.status).toBe('failed')
    expect(player.getStepResult('tap-failed')?.error).toContain('element not found')
    expect(player.state.value).toBe('error')
    // 不应该调用 tap (不降级坐标)
    expect(tapMock).not.toHaveBeenCalled()
  })

  it('坐标字段缺失/非 Error rejection 也能按 continue 继续回放', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    // xpath 查找失败 -> clickElement 抛错（不降级坐标）
    sendCommandMock.mockRejectedValueOnce(new Error('element not found'))
    const xpathNoCoords: any = {
      ...baseAction('t1', { onFailure: 'continue' }),
      type: 'tap',
      xpath: { selector: '//missing' },
      params: { x: 1, y: 2 },
      // 有XPath时不记录coords
    }

    // 无 xpath 且缺 coords -> 抛错
    const noCoords: any = {
      ...baseAction('t2', { onFailure: 'continue' }),
      type: 'tap',
      params: { x: 1, y: 2 },
      coords: undefined,
    }

    // swipe 缺 endCoords -> 抛错
    const swipeMissingEnd: any = {
      ...baseAction('s1', { onFailure: 'continue' }),
      type: 'swipe',
      coords: { x: 0, y: 0, scaleX: 0.1, scaleY: 0.1 },
      endCoords: undefined,
      params: {},
    }

    // tap API reject 非 Error -> errorMsg 走 String(err)
    tapMock.mockRejectedValueOnce('boom')
    const tapRejectString = {
      ...baseAction('t3', { onFailure: 'continue' }),
      type: 'tap',
      coords: { x: 0, y: 0, scaleX: 0.1, scaleY: 0.1 },
      params: { x: 0, y: 0 },
    }

    const after = {
      ...baseAction('after'),
      type: 'command',
      params: { command: 'after' },
    }

    player.load(createRecording([xpathNoCoords, noCoords, swipeMissingEnd, tapRejectString, after]))
    await player.play()

    expect(player.state.value).toBe('idle')
    expect(player.error.value).toBeNull()
    expect(player.getStepResult('t1')?.status).toBe('failed')
    expect(player.getStepResult('t2')?.status).toBe('failed')
    expect(player.getStepResult('s1')?.status).toBe('failed')
    expect(player.getStepResult('t3')?.error).toBe('boom')
    expect(player.getStepResult('after')?.status).toBe('success')
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
      ...baseAction('e1', { onFailure: 'stop' }),
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
    file1.config.globalFailureControl = { enabled: true, onFailure: 'continue' }
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
      ...baseAction('a1', { onFailure: 'continue' }),
      type: 'assert',
      params: { operator: 'and', conditions: [] },
    }
    const assertAfter = {
      ...baseAction('a2'),
      type: 'command',
      params: { command: 'after-assert-fail' },
    }

    const file2 = createRecording([assertFail, assertAfter])
    file2.config.globalFailureControl = { enabled: true, onFailure: 'stop' }
    player.load(file2)

    await player.play()
    expect(player.state.value).toBe('error')
    expect(player.error.value).toBe('断言失败: no')
    expect(player.getStepResult('a1')?.status).toBe('failed')
    expect(player.getStepResult('a2')).toBeUndefined()
    expect(logSpy).toHaveBeenCalledWith('失败截图:', 'data:image/jpeg;base64,abcd')
  })

  it('断言 API 抛错属于执行失败，应使用 onFailure', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    assertCombinedMock.mockRejectedValueOnce(new Error('api-down'))
    const assertAction = {
      ...baseAction('as-err', { onFailure: 'continue' }),
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

  it('断言失败在全局关闭时遵循步骤 onFailure', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    assertCombinedMock.mockResolvedValueOnce({ success: false, message: 'nope' } as any)
    const assertFail = {
      ...baseAction('as1', { onFailure: 'continue' }),
      type: 'assert',
      params: { operator: 'and', conditions: [] },
    }
    const after = {
      ...baseAction('after'),
      type: 'command',
      params: { command: 'after' },
    }

    player.load(createRecording([assertFail, after]))
    await player.play()

    expect(player.state.value).toBe('idle')
    expect(player.getStepResult('as1')?.status).toBe('failed')
    expect(player.getStepResult('after')?.status).toBe('success')
  })

  it('updateGlobalFailureControl 支持无录制/缺字段/部分更新', () => {
    const player = createPlayer()

    // 无录制也不应炸
    player.updateGlobalFailureControl({ enabled: true })

    // 手动塞一个缺 globalFailureControl 的 recording，覆盖补齐分支
    player.recording.value = createRecording([]) as any
    delete (player.recording.value as any).config.globalFailureControl

    // 仅更新 onFailure（enabled 都走 ?? 回退）
    player.updateGlobalFailureControl({ onFailure: 'continue' })
    expect(player.recording.value?.config.globalFailureControl).toEqual({
      enabled: false,
      onFailure: 'continue',
    })

    // 再次更新其它字段
    player.updateGlobalFailureControl({ enabled: true, onFailure: 'stop' })
    expect(player.recording.value?.config.globalFailureControl).toEqual({
      enabled: true,
      onFailure: 'stop',
    })
  })

  it('waitAfter 期间 pause 会在 sleep 后中断循环', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    const a1 = { ...baseAction('c1', { waitAfter: 50 }), type: 'command', params: { command: 'c1' } }
    const a2 = { ...baseAction('c2'), type: 'command', params: { command: 'c2' } }
    player.load(createRecording([a1, a2]))

    const playPromise = player.play()
    await Promise.resolve()
    player.pause()
    await vi.advanceTimersByTimeAsync(50)
    await playPromise

    expect(player.state.value).toBe('paused')
    expect(player.currentIndex.value).toBe(0)
    expect(player.getStepResult('c1')?.status).toBe('success')
    expect(player.getStepResult('c2')).toBeUndefined()
  })

  it('从 paused 恢复时会跳过已完成步骤，避免重复执行', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    const actions = [
      { ...baseAction('c1'), type: 'command', params: { command: 'c1' } },
      { ...baseAction('c2'), type: 'command', params: { command: 'c2' } },
    ]
    player.load(createRecording(actions))

    const first = player.play()
    player.pause()
    await first

    expect(player.state.value).toBe('paused')
    expect(player.currentIndex.value).toBe(0)
    expect(player.getStepResult('c1')?.status).toBe('success')

    await player.play()
    expect(player.state.value).toBe('idle')
    expect(player.getStepResult('c2')?.status).toBe('success')
  })

  it('stepNext 越界/无录制会直接返回，失败会进入 error', async () => {
    const player = createPlayer({ width: 100, height: 200 })

    await player.stepNext()
    expect(sendCommandMock).not.toHaveBeenCalled()

    player.load(createRecording([{ ...baseAction('only'), type: 'command', params: { command: 'only' } }]))
    player.currentIndex.value = 0
    await player.stepNext()
    expect(sendCommandMock).not.toHaveBeenCalled()

    tapMock.mockRejectedValueOnce(new Error('tap-fail'))
    const badTap = {
      ...baseAction('bad'),
      type: 'tap',
      coords: { x: 0, y: 0, scaleX: 0.1, scaleY: 0.1 },
      params: { x: 0, y: 0 },
    }
    player.load(createRecording([badTap]))
    await player.stepNext()
    expect(player.state.value).toBe('error')
    expect(player.error.value).toBe('tap-fail')
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
