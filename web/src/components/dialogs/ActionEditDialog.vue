<template>
  <n-modal
    v-model:show="visible"
    preset="dialog"
    :title="dialogTitle"
    :positive-text="t.common.save"
    :negative-text="t.common.cancel"
    @positive-click="handleSave"
    @negative-click="handleCancel"
  >
    <n-form
      v-if="editingAction"
      ref="formRef"
      :model="formData"
      :rules="rules"
      label-placement="left"
      label-width="120"
      require-mark-placement="left"
    >
      <!-- 操作类型（只读） -->
      <n-form-item :label="t.actions.actionType">
        <n-tag :type="getActionTypeColor(editingAction.type)">
          {{ t.actions.actionTypes[editingAction.type] || editingAction.type }}
        </n-tag>
      </n-form-item>

      <!-- Tap 专属字段 -->
      <template v-if="editingAction.type === 'tap'">
        <n-form-item :label="t.actions.coordinateX" path="coords.x">
          <n-input-number
            v-model:value="formData.coords.x"
            :min="0"
            :precision="0"
            style="width: 100%"
          />
        </n-form-item>
        <n-form-item :label="t.actions.coordinateY" path="coords.y">
          <n-input-number
            v-model:value="formData.coords.y"
            :min="0"
            :precision="0"
            style="width: 100%"
          />
        </n-form-item>
        <n-form-item :label="t.actions.xpathSelector" path="xpath.selector">
          <n-input
            v-model:value="formData.xpath.selector"
            type="textarea"
            :placeholder="t.actions.xpathPlaceholder"
            :autosize="{ minRows: 2, maxRows: 4 }"
          />
        </n-form-item>
      </template>

      <!-- Swipe 专属字段 -->
      <template v-if="editingAction.type === 'swipe'">
        <n-divider title-placement="left">{{ t.actions.startPosition }}</n-divider>
        <n-form-item :label="t.actions.coordinateX" path="coords.x">
          <n-input-number
            v-model:value="formData.coords.x"
            :min="0"
            :precision="0"
            style="width: 100%"
          />
        </n-form-item>
        <n-form-item :label="t.actions.coordinateY" path="coords.y">
          <n-input-number
            v-model:value="formData.coords.y"
            :min="0"
            :precision="0"
            style="width: 100%"
          />
        </n-form-item>

        <n-divider title-placement="left">{{ t.actions.endPosition }}</n-divider>
        <n-form-item :label="t.actions.coordinateX" path="endCoords.x">
          <n-input-number
            v-model:value="formData.endCoords.x"
            :min="0"
            :precision="0"
            style="width: 100%"
          />
        </n-form-item>
        <n-form-item :label="t.actions.coordinateY" path="endCoords.y">
          <n-input-number
            v-model:value="formData.endCoords.y"
            :min="0"
            :precision="0"
            style="width: 100%"
          />
        </n-form-item>

        <n-form-item :label="t.actions.swipeDuration" path="params.duration">
          <n-input-number
            v-model:value="formData.params.duration"
            :min="0.1"
            :max="10"
            :step="0.1"
            :precision="1"
            style="width: 100%"
          >
            <template #suffix>{{ t.actions.seconds }}</template>
          </n-input-number>
        </n-form-item>
      </template>

      <!-- Input 专属字段 -->
      <template v-if="editingAction.type === 'input'">
        <n-form-item :label="t.actions.inputText" path="params.text">
          <n-input
            v-model:value="formData.params.text"
            type="textarea"
            :placeholder="t.actions.inputText"
            :autosize="{ minRows: 2, maxRows: 6 }"
          />
        </n-form-item>
      </template>

      <!-- Sleep 专属字段 -->
      <template v-if="editingAction.type === 'sleep'">
        <n-form-item :label="t.actions.sleepDuration" path="params.duration">
          <n-input-number
            v-model:value="formData.params.duration"
            :min="0"
            :step="100"
            :precision="0"
            style="width: 100%"
          >
            <template #suffix>{{ t.actions.milliseconds }}</template>
          </n-input-number>
        </n-form-item>
      </template>

      <!-- Command 专属字段 -->
      <template v-if="editingAction.type === 'command' || editingAction.type === 'back' || editingAction.type === 'home'">
        <n-form-item :label="t.actions.command" path="params.command">
          <n-input v-model:value="formData.params.command" />
        </n-form-item>
      </template>

      <!-- 通用字段：相对时间 -->
      <n-form-item :label="t.actions.relativeTime" path="relativeTime">
        <n-input-number
          v-model:value="formData.relativeTime"
          :min="0"
          :step="100"
          :precision="0"
          style="width: 100%"
        >
          <template #suffix>{{ t.actions.milliseconds }}</template>
        </n-input-number>
      </n-form-item>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NModal,
  NForm,
  NFormItem,
  NInputNumber,
  NInput,
  NTag,
  NDivider,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import type { RecordedAction } from '@/types/recording'
import { getActionTypeColor } from '@/utils/recordingFormatters'
import { deepClone } from '@/utils/object'
import { useI18nStore } from '@/stores/i18n'

interface Props {
  action: RecordedAction | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  save: [id: string, updates: Partial<RecordedAction>]
  cancel: []
}>()

const i18nStore = useI18nStore()
const t = computed(() => ({
  common: i18nStore.t.common,
  actions: i18nStore.t.actions,
}))

const visible = defineModel<boolean>('show', { required: true })
const formRef = ref<FormInst | null>(null)

// 当前编辑的操作
const editingAction = computed(() => props.action)

// 对话框标题
const dialogTitle = computed(() => {
  if (!editingAction.value) return t.value.actions.editAction
  const actionName = t.value.actions.actionTypes[editingAction.value.type] || editingAction.value.type
  return `${t.value.actions.editAction} - ${actionName}`
})

// 表单数据（深拷贝避免污染原数据）
const formData = ref<any>({
  relativeTime: 0,
  coords: { x: 0, y: 0, scaleX: 0, scaleY: 0 },
  endCoords: { x: 0, y: 0, scaleX: 0, scaleY: 0 },
  xpath: { selector: '', fallbackCoords: { x: 0, y: 0 } },
  params: {},
})

// 监听 action 变化，重置表单
watch(
  () => props.action,
  (newAction) => {
    if (!newAction) return

    // 深拷贝避免污染原数据
    formData.value = deepClone(newAction)

    // 确保嵌套对象存在
    if (!formData.value.coords) {
      formData.value.coords = { x: 0, y: 0, scaleX: 0, scaleY: 0 }
    }
    if (!formData.value.endCoords) {
      formData.value.endCoords = { x: 0, y: 0, scaleX: 0, scaleY: 0 }
    }
    if (!formData.value.xpath) {
      formData.value.xpath = { selector: '', fallbackCoords: { x: 0, y: 0 } }
    }
    if (!formData.value.params) {
      formData.value.params = {}
    }
  },
  { immediate: true }
)

// 验证规则
const rules = computed<FormRules>(() => ({
  relativeTime: [
    {
      required: true,
      type: 'number',
      message: `${t.value.actions.relativeTime}不能为空`,
      trigger: 'blur',
    },
    { type: 'number', min: 0, message: '不能为负数', trigger: 'blur' },
  ],
  'coords.x': [
    { required: true, type: 'number', message: `${t.value.actions.coordinateX}不能为空`, trigger: 'blur' },
    { type: 'number', min: 0, message: '不能为负数', trigger: 'blur' },
  ],
  'coords.y': [
    { required: true, type: 'number', message: `${t.value.actions.coordinateY}不能为空`, trigger: 'blur' },
    { type: 'number', min: 0, message: '不能为负数', trigger: 'blur' },
  ],
  'endCoords.x': [
    { required: true, type: 'number', message: `${t.value.actions.coordinateX}不能为空`, trigger: 'blur' },
    { type: 'number', min: 0, message: '不能为负数', trigger: 'blur' },
  ],
  'endCoords.y': [
    { required: true, type: 'number', message: `${t.value.actions.coordinateY}不能为空`, trigger: 'blur' },
    { type: 'number', min: 0, message: '不能为负数', trigger: 'blur' },
  ],
  'params.text': [{ required: true, message: `${t.value.actions.inputText}不能为空`, trigger: 'blur' }],
  'params.duration': [
    { required: true, type: 'number', message: '时长不能为空', trigger: 'blur' },
  ],
}))

// 保存处理
async function handleSave() {
  if (!formRef.value || !editingAction.value) return

  try {
    await formRef.value.validate()

    // 计算更新内容
    const updates: Partial<RecordedAction> = {}

    // 相对时间（所有类型都有）
    if (formData.value.relativeTime !== editingAction.value.relativeTime) {
      (updates as any).relativeTime = formData.value.relativeTime
    }

    // 根据类型复制修改的字段
    if (editingAction.value.type === 'tap') {
      if (
        formData.value.coords.x !== editingAction.value.coords.x ||
        formData.value.coords.y !== editingAction.value.coords.y
      ) {
        // 坐标变化，需要重新计算 scale
        (updates as any).coords = {
          ...formData.value.coords,
        }
        // 同步更新 params
        (updates as any).params = {
          x: formData.value.coords.x,
          y: formData.value.coords.y,
        }
      }

      // XPath 变化
      const oldXPath = editingAction.value.xpath?.selector || ''
      const newXPath = formData.value.xpath?.selector || ''
      if (oldXPath !== newXPath) {
        if (newXPath) {
          (updates as any).xpath = {
            selector: newXPath,
            fallbackCoords: {
              x: formData.value.coords.x,
              y: formData.value.coords.y,
            },
          }
        } else {
          // 清空 XPath
          (updates as any).xpath = undefined
        }
      }
    } else if (editingAction.value.type === 'swipe') {
      const coordsChanged =
        formData.value.coords.x !== editingAction.value.coords.x ||
        formData.value.coords.y !== editingAction.value.coords.y ||
        formData.value.endCoords.x !== editingAction.value.endCoords.x ||
        formData.value.endCoords.y !== editingAction.value.endCoords.y

      if (coordsChanged) {
        (updates as any).coords = { ...formData.value.coords }
        (updates as any).endCoords = { ...formData.value.endCoords }
        (updates as any).params = {
          startX: formData.value.coords.x,
          startY: formData.value.coords.y,
          endX: formData.value.endCoords.x,
          endY: formData.value.endCoords.y,
          duration: formData.value.params.duration || 0.5,
        }
      } else if (formData.value.params.duration !== editingAction.value.params.duration) {
        (updates as any).params = {
          ...editingAction.value.params,
          duration: formData.value.params.duration,
        }
      }
    } else if (editingAction.value.type === 'input') {
      if (formData.value.params.text !== editingAction.value.params.text) {
        (updates as any).params = { text: formData.value.params.text }
      }
    } else if (editingAction.value.type === 'sleep') {
      if (formData.value.params.duration !== editingAction.value.params.duration) {
        (updates as any).params = { duration: formData.value.params.duration }
      }
    }

    // 发送保存事件
    emit('save', editingAction.value.id, updates)
    visible.value = false
  } catch (error) {
    console.warn('表单验证失败:', error)
  }
}

function handleCancel() {
  visible.value = false
  emit('cancel')
}
</script>

<style scoped>
:deep(.n-form-item-label) {
  font-weight: 500;
}
</style>
