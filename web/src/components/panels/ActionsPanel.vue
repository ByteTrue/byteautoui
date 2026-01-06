<template>
  <div class="actions-panel">
    <n-tabs v-model:value="activeTab" type="segment">
      <!-- 录制Tab -->
      <n-tab-pane name="record" :tab="t.recordTab">
        <RecordTab
          :recorder="recorder"
          :player="player"
          :current-playback-index="player.currentIndex.value"
          :is-playback-active="player.isPlaying.value"
          :t="t"
          :step-results="player.stepResults.value"
          @toggle-recording="toggleRecording"
          @toggle-pause="togglePause"
          @clear-recording="clearRecording"
          @save-recording="showSaveRecordingDialog"
          @edit-action="editAction"
          @delete-action="deleteAction"
          @assert-menu-select="$emit('assert-menu-select', $event)"
          @reorder-actions="handleReorderActions"
        />
      </n-tab-pane>

      <!-- 回放Tab -->
      <n-tab-pane name="playback" :tab="t.playbackTab">
        <PlaybackTab
          :player="player"
          :recordings="recordings"
          :loading="loadingRecordings"
          :is-recording-active="recorder.isRecording.value"
          :t="t"
          :common-t="i18nStore.t.common"
          @refresh-recordings="refreshRecordings"
          @start-playback="startPlayback"
          @load-recording="loadRecording"
          @edit-recording="handleEditRecording"
          @delete-recording="handleDeleteRecording"
        />
      </n-tab-pane>
    </n-tabs>

    <!-- 保存对话框 -->
    <n-modal v-model:show="showSaveDialog" preset="dialog" title="保存录制">
      <n-form :model="saveDialogForm">
        <n-form-item label="分组">
          <n-input v-model:value="saveDialogForm.group" placeholder="default" />
        </n-form-item>
        <n-form-item label="名称">
          <n-input v-model:value="saveDialogForm.name" placeholder="my-recording" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space justify="end">
          <n-button @click="showSaveDialog = false">取消</n-button>
          <n-button type="primary" @click="confirmSaveRecording">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑对话框 -->
    <ActionEditDialog
      v-model:show="showEditDialog"
      :action="editingAction"
      :screen-size="screenSize"
      @save="handleSaveActionEdit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NTabs, NTabPane, NModal, NForm, NFormItem, NInput, NButton, NSpace, useMessage, useDialog } from 'naive-ui'
import RecordTab from './RecordTab.vue'
import PlaybackTab from './PlaybackTab.vue'
import ActionEditDialog from '../dialogs/ActionEditDialog.vue'
import { useRecorder } from '@/composables/useRecorder'
import { usePlayer } from '@/composables/usePlayer'
import { useDeviceStore } from '@/stores/device'
import { useI18nStore } from '@/stores/i18n'
import type { Platform, UINode } from '@/api/types'
import type { RecordedAction, AssertParams } from '@/types/recording'
import {
  saveRecording as saveRecordingAPI,
  listRecordings,
  loadRecording as loadRecordingAPI,
  deleteRecording,
  type RecordingMetadata,
} from '@/api/recording'
import type { FailureBehavior } from '@/types/recording'

const props = defineProps<{
  platform: Platform
  serial: string
}>()

const emit = defineEmits<{
  'assert-menu-select': [key: string]
  'edit-assert': [action: RecordedAction]
}>()

const message = useMessage()
const dialog = useDialog()
const store = useDeviceStore()
const i18nStore = useI18nStore()

// 国际化文本
const t = computed(() => i18nStore.t.actions)

// 统一错误处理
function showError(prefix: string, error: unknown): void {
  message.error(`${prefix}: ${error instanceof Error ? error.message : String(error)}`)
}

const activeTab = ref('record')

// 录制列表
const recordings = ref<RecordingMetadata[]>([])
const loadingRecordings = ref(false)

// 保存对话框
const showSaveDialog = ref(false)
const saveDialogForm = ref({
  group: 'default',
  name: '',
})

// 编辑对话框
const showEditDialog = ref(false)
const editingAction = ref<RecordedAction | null>(null)

// 获取当前屏幕尺寸（响应式）
const screenSize = computed(() => store.screenSize)

// 初始化录制器和播放器（传递响应式引用）
const recorder = useRecorder(props.platform, props.serial, screenSize)
const player = usePlayer(props.platform, props.serial, screenSize)

// 录制相关方法
function toggleRecording() {
  if (recorder.isRecording.value) {
    recorder.stop()
  } else {
    recorder.start()
  }
}

function togglePause() {
  if (recorder.isPaused.value) {
    recorder.resume()
  } else {
    recorder.pause()
  }
}

function clearRecording() {
  dialog.warning({
    title: '确认清空',
    content: '确定要清空所有录制步骤吗？',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: () => {
      recorder.clear()
      message.success('已清空录制')
    },
  })
}

function generateDefaultRecordingName(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  return `Recording_${year}${month}${day}_${hour}${minute}${second}`
}

function showSaveRecordingDialog() {
  // 生成默认文件名
  saveDialogForm.value.name = generateDefaultRecordingName()
  saveDialogForm.value.group = 'default'
  showSaveDialog.value = true
}

async function confirmSaveRecording() {
  if (!saveDialogForm.value.name) {
    message.warning('请输入录制名称')
    return
  }

  if (recorder.actionCount.value === 0) {
    message.warning('没有可保存的录制')
    return
  }

  try {
    const recordingFile = recorder.exportRecording(saveDialogForm.value.name)
    await saveRecordingAPI({
      group: saveDialogForm.value.group || 'default',
      name: saveDialogForm.value.name,
      data: recordingFile,
    })

    message.success('录制已保存')
    showSaveDialog.value = false
    saveDialogForm.value = { group: 'default', name: '' }

    // 刷新列表
    await refreshRecordings()
  } catch (error) {
    showError('保存失败', error)
  }
}

function deleteAction(id: string) {
  recorder.deleteAction(id)
}

function handleReorderActions(actions: RecordedAction[]) {
  recorder.reorderActions(actions)
}

function editAction(action: RecordedAction) {
  // 断言类型使用专门的AssertConfigDialog编辑
  if (action.type === 'assert') {
    emit('edit-assert', action)
    return
  }
  editingAction.value = action
  showEditDialog.value = true
}

function handleSaveActionEdit(id: string, updates: Partial<RecordedAction>) {
  try {
    const success = recorder.updateAction(id, updates)
    if (success) {
      message.success('操作已更新')
    } else {
      message.error('更新失败：操作不存在')
    }
  } catch (error) {
    showError('更新失败', error)
  }
}

// 回放相关方法
async function refreshRecordings() {
  loadingRecordings.value = true
  try {
    recordings.value = await listRecordings()
  } catch (error) {
    showError('获取录制列表失败', error)
  } finally {
    loadingRecordings.value = false
  }
}

async function loadRecording(group: string, name: string) {
  try {
    const recording = await loadRecordingAPI(group, name)
    player.load(recording)
    message.success(`已加载录制: ${name}`)
  } catch (error) {
    showError('加载录制失败', error)
  }
}

async function handleEditRecording(group: string, name: string) {
  // 检查是否有未保存的录制
  if (recorder.actionCount.value > 0) {
    dialog.warning({
      title: '确认覆盖',
      content: '当前有未保存的录制操作，加载新录制将会覆盖这些操作。是否继续？',
      positiveText: '继续加载',
      negativeText: '取消',
      onPositiveClick: async () => {
        await loadRecordingForEdit(group, name)
      },
    })
    return
  }

  await loadRecordingForEdit(group, name)
}

async function loadRecordingForEdit(group: string, name: string) {
  try {
    const recording = await loadRecordingAPI(group, name)
    // 导入到录制器，这样可以在录制Tab中编辑
    recorder.importRecording(recording)
    // 切换到录制Tab
    activeTab.value = 'record'
    message.success(`已加载 "${name}" 到录制器，可以编辑了`)
  } catch (error) {
    showError('加载录制失败', error)
  }
}

async function handleDeleteRecording(group: string, name: string) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除录制 "${name}" 吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteRecording(group, name)
        message.success('已删除')
        await refreshRecordings()
      } catch (error) {
        showError('删除失败', error)
      }
    },
  })
}

async function startPlayback() {
  try {
    await player.play()
  } catch (error) {
    showError('回放失败', error)
  }
}

// 公开方法（供父组件调用）
async function recordTap(x: number, y: number, selectedNode: UINode | null) {
  await recorder.recordTap(x, y, selectedNode)
}

async function recordSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration: number,
  selectedNode: UINode | null
) {
  await recorder.recordSwipe(startX, startY, endX, endY, duration, selectedNode)
}

function getIsRecording() {
  return recorder.isRecording.value
}

/**
 * 录制断言操作
 */
async function recordAssert(params: AssertParams, onFailure?: FailureBehavior) {
  await recorder.recordAssert(params, onFailure)
}

// 组件挂载时加载录制列表
onMounted(() => {
  refreshRecordings()
})

// 导出方法供父组件使用
defineExpose({
  recordTap,
  recordSwipe,
  recordAssert,
  getIsRecording,
  recorder, // 导出recorder以支持断言编辑
})
</script>

<style scoped>
.actions-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

:deep(.n-tabs) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

:deep(.n-tabs-nav) {
  flex-shrink: 0;
}

:deep(.n-tabs-pane-wrapper) {
  flex: 1;
  overflow: hidden;
}

:deep(.n-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.tab-content),
:deep(.playback-tab-layout) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
