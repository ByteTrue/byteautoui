<template>
  <div class="playback-tab-layout">
    <!-- 上部：录制列表（可滚动） -->
    <div class="recordings-section">
      <div class="section-header">
        <h3>{{ t.recordingList }} ({{ recordingsTree.length > 0 ? recordingsTree.reduce((sum, g) => sum + (g.children?.length || 0), 0) : 0 }})</h3>
        <n-button size="small" @click="$emit('refresh-recordings')" :loading="loading">
          <template #icon>
            <n-icon><RefreshOutline /></n-icon>
          </template>
          {{ commonT.refresh }}
        </n-button>
      </div>

      <!-- 树形录制列表 -->
      <n-tree
        v-if="recordingsTree.length > 0"
        :data="recordingsTree"
        :render-label="renderRecordingLabel"
        :render-suffix="renderRecordingSuffix"
        :node-props="nodeProps"
        block-line
        expand-on-click
        :default-expanded-keys="defaultExpandedKeys"
      />

      <n-empty v-else :description="t.noRecordings" />
    </div>

    <!-- 中部：固定的控制栏（作为分割线） -->
    <div class="playback-controls-divider">
      <!-- 回放控制栏 -->
      <div class="control-bar">
        <n-space :size="8">
          <n-button
            type="success"
            :disabled="!player.canPlay.value || isRecordingActive"
            :loading="player.isPlaying.value"
            @click="$emit('start-playback')"
          >
            <template #icon>
              <n-icon><PlayOutline /></n-icon>
            </template>
            {{ t.play }}
          </n-button>

          <n-button v-if="player.isPlaying.value" @click="player.pause()">
            <template #icon>
              <n-icon><PauseOutline /></n-icon>
            </template>
            {{ t.pause }}
          </n-button>

          <n-button
            :disabled="!player.isPlaying.value && !player.isPaused.value"
            @click="player.stop()"
          >
            <template #icon>
              <n-icon><StopCircleOutline /></n-icon>
            </template>
            {{ t.stop }}
          </n-button>

          <n-button :disabled="!player.isPaused.value" @click="player.stepNext()">
            <template #icon>
              <n-icon><PlaySkipForwardOutline /></n-icon>
            </template>
            {{ t.step }}
          </n-button>
        </n-space>

        <!-- 进度信息（紧凑显示） -->
        <n-space :size="8" align="center" v-if="player.recording.value">
          <span class="progress-text"
            >{{ t.progress }}: {{ player.progress.value.currentIndex + 1 }} /
            {{ player.progress.value.totalSteps }}</span
          >
          <n-tag :type="getPlaybackStateColor(player.state.value)" size="small">
            {{ getPlaybackStateText(player.state.value) }}
          </n-tag>
        </n-space>
      </div>

      <!-- 错误提示 -->
      <div v-if="player.error.value" class="error-message-compact">
        <n-alert type="error" :title="player.error.value" closable />
      </div>
    </div>

    <!-- 下部：步骤预览列表（可滚动） -->
    <div class="playback-steps-section">
      <div v-if="player.recording.value" class="steps-list">
        <div
          v-for="(action, index) in player.recording.value.actions"
          :key="action.id"
          class="step-item"
          :class="{
            active: player.currentIndex.value === index,
            completed: player.currentIndex.value > index,
            pending: player.currentIndex.value < index,
          }"
        >
          <span class="step-index">{{ Number(index) + 1 }}</span>
          <n-tag :type="getActionTypeColor(action.type)" size="small">
            {{ action.type }}
          </n-tag>
          <span class="step-details">{{ formatActionParams(action) }}</span>
          <span class="step-time">{{ formatRelativeTime(action.relativeTime) }}</span>
        </div>
      </div>
      <n-empty v-else :description="t.selectRecording" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import {
  NButton,
  NSpace,
  NTag,
  NIcon,
  NTree,
  NEmpty,
  NAlert,
  type TreeOption,
} from 'naive-ui'
import {
  RefreshOutline,
  PlayOutline,
  PauseOutline,
  StopCircleOutline,
  PlaySkipForwardOutline,
  PlayCircleOutline,
  TrashOutline,
  CreateOutline,
} from '@vicons/ionicons5'
import type { RecordingMetadata } from '@/api/recording'
import {
  formatFileSize,
  formatDate,
  formatActionParams,
  formatRelativeTime,
  getActionTypeColor,
  getPlaybackStateColor,
  getPlaybackStateText,
} from '@/utils/recordingFormatters'

interface RecordingTreeNode extends TreeOption {
  key: string
  label: string
  isGroup?: boolean
  recording?: RecordingMetadata
  children?: RecordingTreeNode[]
}

interface Props {
  player: any // usePlayer composable
  recordings: RecordingMetadata[]
  loading: boolean
  isRecordingActive: boolean
  t: any // actions i18n
  commonT: any // common i18n
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'refresh-recordings': []
  'start-playback': []
  'load-recording': [group: string, name: string]
  'edit-recording': [group: string, name: string]
  'delete-recording': [group: string, name: string]
}>()

// 树形录制列表数据结构
const recordingsTree = computed<RecordingTreeNode[]>(() => {
  if (props.recordings.length === 0) return []

  // 按分组归类
  const groupMap = new Map<string, RecordingMetadata[]>()

  props.recordings.forEach((rec) => {
    const group = rec.group || 'default'
    const list = groupMap.get(group)
    if (!list) {
      groupMap.set(group, [rec])
    } else {
      list.push(rec)
    }
  })

  // 转换为树形结构
  const tree: RecordingTreeNode[] = []

  groupMap.forEach((items, group) => {
    const groupNode: RecordingTreeNode = {
      key: `group-${group}`,
      label: group,
      isGroup: true,
      children: items.map((rec) => ({
        key: `${rec.group}/${rec.name}`,
        label: rec.name,
        recording: rec,
      })),
    }
    tree.push(groupNode)
  })

  return tree
})

// 默认展开所有分组
const defaultExpandedKeys = computed(() => {
  return recordingsTree.value.map((node) => node.key)
})

// 自定义渲染录制项标签
function renderRecordingLabel({ option }: { option: TreeOption }) {
  const node = option as RecordingTreeNode

  if (node.isGroup) {
    // 分组节点：显示分组名 + 数量
    const count = node.children?.length || 0
    return h('span', { class: 'tree-group-label' }, [
      h('span', { class: 'group-name' }, node.label),
      h('span', { class: 'group-count' }, `(${count})`),
    ])
  } else {
    // 录制项节点：显示名称 + 元信息
    const rec = node.recording!
    return h('div', { class: 'tree-recording-label' }, [
      h('div', { class: 'recording-name' }, rec.name),
      h('div', { class: 'recording-meta' }, [
        h('span', { class: 'meta-item' }, formatFileSize(rec.size)),
        h('span', { class: 'meta-item' }, formatDate(rec.modified_at)),
      ]),
    ])
  }
}

// 自定义渲染录制项后缀（操作按钮）
function renderRecordingSuffix({ option }: { option: TreeOption }) {
  const node = option as RecordingTreeNode

  // 只为录制项渲染操作按钮，分组不渲染
  if (node.isGroup || !node.recording) return null

  const rec = node.recording

  return h(
    'div',
    {
      class: 'tree-node-actions',
      onClick: (e: MouseEvent) => e.stopPropagation(),
    },
    [
      h(
        NButton,
        {
          size: 'tiny',
          quaternary: true,
          onClick: () => emit('load-recording', rec.group, rec.name),
        },
        { icon: () => h(NIcon, null, { default: () => h(PlayCircleOutline) }) }
      ),
      h(
        NButton,
        {
          size: 'tiny',
          quaternary: true,
          onClick: () => emit('edit-recording', rec.group, rec.name),
        },
        { icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) }
      ),
      h(
        NButton,
        {
          size: 'tiny',
          quaternary: true,
          onClick: () => emit('delete-recording', rec.group, rec.name),
        },
        { icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }
      ),
    ]
  )
}

// 树节点属性
function nodeProps({ option }: { option: TreeOption }) {
  const node = option as RecordingTreeNode

  // 分组节点不可点击
  if (node.isGroup) {
    return {}
  }

  // 录制项节点可点击加载
  return {
    onClick: () => {
      if (node.recording) {
        emit('load-recording', node.recording.group, node.recording.name)
      }
    },
  }
}
</script>

<style scoped>
.playback-tab-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  padding: 0 16px;
}

.recordings-section {
  flex: 0 0 auto;
  max-height: 30%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.playback-controls-divider {
  flex: 0 0 auto;
}

.control-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--n-color-embedded);
  border-radius: 8px;
  margin-bottom: 8px;
}

.progress-text {
  font-size: 13px;
  color: var(--n-text-color-2);
  font-family: monospace;
}

.error-message-compact {
  margin-bottom: 8px;
}

.playback-steps-section {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.steps-list {
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

.step-item.completed {
  opacity: 0.6;
}

.step-item.pending {
  opacity: 0.4;
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

/* 树形列表样式 */
:deep(.tree-group-label) {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

:deep(.group-count) {
  font-size: 12px;
  color: var(--n-text-color-3);
  font-weight: normal;
}

:deep(.tree-recording-label) {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

:deep(.recording-name) {
  font-size: 13px;
  font-weight: 500;
}

:deep(.recording-meta) {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--n-text-color-3);
}

:deep(.tree-node-actions) {
  display: flex;
  gap: 4px;
}
</style>
