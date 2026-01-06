import { ref, computed } from 'vue'
import { vi } from 'vitest'
import type { RecordedAction, RecordingConfig, StepResult } from '@/types/recording'

// Mock useRecorder
// Mock useRecorder
export function createMockRecorder() {
  const isRecording = ref(false)
  const isPaused = ref(false)
  const duration = ref(0)
  const actions = ref<RecordedAction[]>([])
  const actionCount = computed(() => actions.value.length)

  return {
    isRecording,
    isPaused,
    duration,
    actions,
    actionCount
  }
}

// Mock usePlayer
export function createMockPlayer() {
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const state = ref('idle')
  const error = ref<string | null>(null)
  const currentIndex = ref(-1)
  const progress = ref({
    currentIndex: -1,
    totalSteps: 0,
    elapsedTime: 0,
    state: 'idle'
  })

  const recording = ref({
    config: {
      globalFailureControl: {
        enabled: false,
        onExecuteFailure: 'stop',
        onAssertFailure: 'stop'
      }
    },
    actions: [] as RecordedAction[]
  })

  const stepResults = new Map<string, StepResult>()
  const getStepResult = (id: string) => stepResults.get(id)

  const canPlay = computed(() => recording.value && recording.value.actions.length > 0)
  const recordingValue = computed(() => recording.value)
  const globalFailureControl = computed(() => recording.value?.config.globalFailureControl)

  return {
    isPlaying,
    isPaused,
    state,
    error,
    currentIndex,
    progress,
    recording: recordingValue,
    globalFailureControl,
    getStepResult,
    canPlay,
    pause: vi.fn(),
    stop: vi.fn(),
    stepNext: vi.fn()
  }
}

// Mock i18n
export const mockT = {
  recordingList: '录制列表',
  noRecordings: '暂无录制',
  play: '播放',
  pause: '暂停',
  stop: '停止',
  step: '单步',
  progress: '进度',
  selectRecording: '选择录制',
  startRecording: '开始录制',
  stopRecording: '停止录制',
  pauseRecording: '暂停录制',
  continueRecording: '继续录制',
  clearRecording: '清空',
  saveRecording: '保存',
  recording: '录制中',
  recordingPaused: '已暂停',
  operationSteps: '操作步骤',
  noOperations: '无操作',
  assert: '断言',
  elementAssertion: '元素断言',
  screenshotAssertion: '截图断言',
  combinedAssertion: '组合断言',
  failureControl: {
    title: '失败控制',
    globalSwitch: '全局覆盖',
    onExecute: '执行失败',
    onAssert: '断言失败',
    continue: '跳过',
    stop: '停止',
    behaviors: {
      continue: '跳过',
      stop: '停止'
    }
  }
}

export const mockCommonT = {
  refresh: '刷新'
}
