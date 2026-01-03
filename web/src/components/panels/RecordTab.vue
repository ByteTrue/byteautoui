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

      <div v-if="recorder.actionCount.value > 0" class="steps-list">
        <div
          v-for="(action, index) in recorder.actions.value"
          :key="action.id"
          class="step-item"
          :class="{ active: currentPlaybackIndex === index }"
        >
          <span class="step-index">{{ index + 1 }}</span>
          <n-tag :type="getActionTypeColor(action.type)" size="small">
            {{ action.type }}
          </n-tag>
          <span class="step-details">{{ formatActionParams(action) }}</span>
          <span class="step-time">{{ formatRelativeTime(action.relativeTime) }}</span>
          <n-button-group size="tiny">
            <n-button @click="$emit('edit-action', action)">
              <n-icon><CreateOutline /></n-icon>
            </n-button>
            <n-button @click="$emit('delete-action', action.id)">
              <n-icon><TrashOutline /></n-icon>
            </n-button>
          </n-button-group>
        </div>
      </div>

      <n-empty v-else :description="t.noOperations" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton, NSpace, NTag, NIcon, NButtonGroup, NEmpty } from 'naive-ui'
import {
  RadioButtonOnOutline,
  StopCircleOutline,
  SaveOutline,
  CreateOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import type { RecordedAction } from '@/types/recording'
import {
  formatDuration,
  formatRelativeTime,
  formatActionParams,
  getActionTypeColor,
} from '@/utils/recordingFormatters'

interface Props {
  recorder: any // useRecorder composable
  currentPlaybackIndex: number
  isPlaybackActive: boolean
  t: any // i18n translations
}

defineProps<Props>()

defineEmits<{
  'toggle-recording': []
  'toggle-pause': []
  'clear-recording': []
  'save-recording': []
  'edit-action': [action: RecordedAction]
  'delete-action': [id: string]
}>()
</script>

<style scoped>
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
</style>
