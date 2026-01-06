<template>
  <div class="tab-content">
    <!-- 录制控制栏 -->
    <div class="control-bar">
      <n-space :size="8">
        <n-button
          :type="recorder.isRecording.value ? 'error' : 'primary'"
          :disabled="isPlaybackActive"
          @click="$emit('toggle-recording')"
        >
          <template #icon>
            <n-icon>
              <RadioButtonOnOutline v-if="!recorder.isRecording.value" />
              <StopCircleOutline v-else />
            </n-icon>
          </template>
          {{ recorder.isRecording.value ? t.stopRecording : t.startRecording }}
        </n-button>

        <n-button
          v-if="recorder.isRecording.value"
          :type="recorder.isPaused.value ? 'default' : 'warning'"
          @click="$emit('toggle-pause')"
        >
          {{ recorder.isPaused.value ? t.continueRecording : t.pauseRecording }}
        </n-button>

        <!-- 断言按钮 - 录制中或有已录制内容时可用 -->
        <n-dropdown
          v-if="recorder.isRecording.value || recorder.actionCount.value > 0"
          trigger="click"
          :options="assertMenuOptions"
          @select="handleAssertMenuSelect"
          :disabled="recorder.isPaused.value"
        >
          <n-button :disabled="recorder.isPaused.value">
            <template #icon>
              <n-icon><CheckmarkDoneOutline /></n-icon>
            </template>
            {{ t.assert }}
          </n-button>
        </n-dropdown>

        <n-button :disabled="recorder.actionCount.value === 0" @click="$emit('clear-recording')">
          {{ t.clearRecording }} ({{ recorder.actionCount.value }})
        </n-button>
      </n-space>

      <n-space :size="8">
        <n-button :disabled="recorder.actionCount.value === 0" @click="$emit('save-recording')">
          <template #icon><n-icon><SaveOutline /></n-icon></template>
          {{ t.saveRecording }}
        </n-button>
      </n-space>
    </div>

    <!-- 录制状态指示 -->
    <div v-if="recorder.isRecording.value" class="recording-indicator">
      <n-tag :type="recorder.isPaused.value ? 'warning' : 'error'" round>
        <template #icon>
          <n-icon><RadioButtonOnOutline /></n-icon>
        </template>
        {{ recorder.isPaused.value ? t.recordingPaused : t.recording }}
      </n-tag>
      <span class="duration">{{ formatDuration(recorder.duration.value) }}</span>
    </div>

    <!-- 步骤列表 -->
    <div class="steps-section">
      <h3>{{ t.operationSteps }} ({{ recorder.actionCount.value }})</h3>

      <draggable
        v-if="recorder.actionCount.value > 0"
        v-model="recorder.actions.value"
        item-key="id"
        class="steps-list"
        handle=".drag-handle"
        ghost-class="step-item-ghost"
        :disabled="isPlaybackActive || recorder.isRecording.value"
        @end="handleDragEnd"
      >
        <template #item="{ element: action, index }">
          <div
            class="step-item"
            :class="getStepResultClass(action, index)"
          >
            <span class="drag-handle" :class="{ disabled: isPlaybackActive || recorder.isRecording.value }">
              <n-icon><ReorderThreeOutline /></n-icon>
            </span>
            <span class="step-index">{{ Number(index) + 1 }}</span>
            <n-tag :type="getActionTypeColor(action.type)" size="small">
              {{ action.type }}
            </n-tag>
            <span class="step-details">{{ formatActionParams(action) }}</span>
            <!-- 失败策略徽章 -->
            <n-tooltip v-if="getFailureConfigInfo(action)" trigger="hover">
              <template #trigger>
                <div 
                  class="failure-badge" 
                  :class="[
                    getFailureConfigInfo(action)!.behavior, 
                    { global: getFailureConfigInfo(action)!.isGlobal }
                  ]"
                >
                  <n-icon :component="getFailureConfigInfo(action)!.icon" />
                </div>
              </template>
              {{ getFailureConfigInfo(action)!.tooltip }}
            </n-tooltip>

            <!-- 断言结果标签 -->
            <n-tag
              v-if="getAssertResultTag(action)"
              :type="getAssertResultTag(action)!.type"
              size="small"
              class="assert-result-tag"
            >
              {{ getAssertResultTag(action)!.text }}
            </n-tag>
            <span class="step-time">{{ formatWaitAfter(action.waitAfter) }}</span>
            <n-button-group size="tiny">
              <n-button @click="$emit('edit-action', action)">
                <n-icon><CreateOutline /></n-icon>
              </n-button>
              <n-button @click="$emit('delete-action', action.id)">
                <n-icon><TrashOutline /></n-icon>
              </n-button>
            </n-button-group>
          </div>
        </template>
      </draggable>

      <n-empty v-else :description="t.noOperations" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton, NSpace, NTag, NIcon, NButtonGroup, NEmpty, NDropdown, NTooltip } from 'naive-ui'
import {
  RadioButtonOnOutline,
  StopCircleOutline,
  SaveOutline,
  CreateOutline,
  TrashOutline,
  CheckmarkDoneOutline,
  ReorderThreeOutline,
  WarningOutline,
  CloseCircleOutline,
} from '@vicons/ionicons5'
import draggable from 'vuedraggable'
import type { RecordedAction, StepResult, FailureBehavior } from '@/types/recording'
import {
  formatDuration,
  formatWaitAfter,
  formatActionParams,
  getActionTypeColor,
} from '@/utils/recordingFormatters'
import { computed } from 'vue'

interface Props {
  recorder: any // useRecorder composable
  player: any // usePlayer composable
  currentPlaybackIndex: number
  isPlaybackActive: boolean
  t: any // i18n translations
  stepResults?: Map<string, StepResult> // 步骤执行结果
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'toggle-recording': []
  'toggle-pause': []
  'clear-recording': []
  'save-recording': []
  'edit-action': [action: RecordedAction]
  'delete-action': [id: string]
  'assert-menu-select': [key: string]
  'reorder-actions': [actions: RecordedAction[]]
}>()

// 断言菜单选项
const assertMenuOptions = computed(() => [
  { label: props.t.elementAssertion, key: 'element' },
  { label: props.t.screenshotAssertion, key: 'screenshot' },
  { label: props.t.combinedAssertion, key: 'combined' },
])

// 断言菜单选择处理
function handleAssertMenuSelect(key: string) {
  emit('assert-menu-select', key)
}

// 拖拽结束处理 - 重新计算相对时间
function handleDragEnd() {
  // 通知父组件重新排序后的actions（vuedraggable已经修改了数组顺序）
  emit('reorder-actions', props.recorder.actions.value)
}

// 获取步骤结果样式类
function getStepResultClass(action: RecordedAction, index: number): Record<string, boolean> {
  const result = props.stepResults?.get(action.id)
  return {
    active: props.currentPlaybackIndex === index,
    pending: !result && props.isPlaybackActive && index > props.currentPlaybackIndex,
    running: result?.status === 'running',
    success: result?.status === 'success',
    failed: result?.status === 'failed',
    dimmed: props.isPlaybackActive && !result && index > props.currentPlaybackIndex,
  }
}

// 获取断言结果标签
function getAssertResultTag(action: RecordedAction): { show: boolean; text: string; type: 'success' | 'error' } | null {
  if (action.type !== 'assert') return null
  const result = props.stepResults?.get(action.id)
  if (!result || result.status === 'pending' || result.status === 'running') return null
  return {
    show: true,
    text: result.status === 'success' ? 'PASS' : 'FAIL',
    type: result.status === 'success' ? 'success' : 'error',
  }
}

// 获取失败配置信息
function getFailureConfigInfo(action: RecordedAction) {
  // 检查是否被全局覆盖
  const globalConfig = props.player?.globalFailureControl?.value
  const isGlobalEnabled = globalConfig?.enabled

  const behavior = isGlobalEnabled
    ? globalConfig.onFailure
    : action.onFailure

  // 默认为 stop
  const finalBehavior = behavior || 'stop'

  // 只有非默认行为(continue)才显示，或者是全局启用时显示
  if (finalBehavior === 'stop' && !isGlobalEnabled) return null

  return {
    behavior: finalBehavior,
    isGlobal: isGlobalEnabled,
    icon: finalBehavior === 'continue' ? WarningOutline : CloseCircleOutline,
    color: finalBehavior === 'continue' ? 'warning' : 'error',
    tooltip: isGlobalEnabled
      ? props.t.failureControl.globalSwitch
      : (finalBehavior === 'continue' ? props.t.failureControl.behaviors.continue : props.t.failureControl.behaviors.stop)
  }
}
</script>

<style scoped>
.tab-content {
  padding: 0 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--n-color-embedded);
  border-radius: 8px;
  margin-bottom: 12px;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--n-color-embedded);
  border-radius: 6px;
  margin-bottom: 12px;
}

.duration {
  font-weight: 600;
  font-family: monospace;
  font-size: 14px;
}

.steps-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.steps-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--n-text-color);
}

.steps-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--n-color-embedded);
  border-radius: 6px;
  border-left: 3px solid transparent;
  transition: all 0.2s ease;
}

.step-item.active {
  border-left-color: var(--n-color-primary);
  background: var(--n-color-primary-hover);
}

/* 回放状态可视化 */
.step-item.dimmed {
  opacity: 0.5;
}

.step-item.running {
  border-left-color: var(--n-color-warning);
  background: rgba(255, 193, 7, 0.1);
  animation: pulse 1s infinite;
}

.step-item.success {
  border-left-color: var(--n-color-success);
  background: rgba(16, 185, 129, 0.1);
}

.step-item.failed {
  border-left-color: var(--n-color-error);
  background: rgba(239, 68, 68, 0.1);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.assert-result-tag {
  font-weight: 600;
  font-size: 10px;
}

.step-item:hover {
  background: var(--n-color-hover);
}

.step-index {
  min-width: 32px;
  text-align: center;
  font-weight: 600;
  color: var(--n-text-color-2);
  font-size: 12px;
}

.step-details {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-time {
  font-size: 12px;
  color: var(--n-text-color-3);
  min-width: 60px;
  text-align: right;
}

.drag-handle {
  cursor: grab;
  color: var(--n-text-color-3);
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s ease;
}

.drag-handle:hover {
  color: var(--n-text-color);
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle.disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.step-item-ghost {
  opacity: 0.5;
  background: var(--n-color-primary-hover);
  border-left-color: var(--n-color-primary);
}

.failure-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 12px;
  margin-left: 4px;
}

.failure-badge.continue {
  color: var(--n-color-warning);
  background: rgba(255, 193, 7, 0.1);
}

.failure-badge.stop {
  color: var(--n-color-error);
  background: rgba(239, 68, 68, 0.1);
}

.failure-badge.global {
  border: 1px dashed currentColor;
}
</style>
