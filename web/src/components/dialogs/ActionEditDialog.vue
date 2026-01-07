<template>
  <n-modal
    v-model:show="visible"
    preset="dialog"
    :title="dialogTitle"
    :positive-text="t.common.save"
    :negative-text="t.common.cancel"
    :style="{ width: '700px', maxWidth: '90vw' }"
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
          <n-input
            v-model:value="formData.params.command"
            :disabled="editingAction.type === 'back' || editingAction.type === 'home'"
            :placeholder="editingAction.type === 'back' ? 'back' : editingAction.type === 'home' ? 'home' : ''"
          />
        </n-form-item>
      </template>

      <!-- Assert 断言专属字段 -->
      <template v-if="editingAction.type === 'assert'">
        <!-- 逻辑运算符 -->
        <n-form-item label="逻辑运算">
          <n-radio-group v-model:value="formData.params.operator">
            <n-radio value="and">AND (所有条件满足)</n-radio>
            <n-radio value="or">OR (任一条件满足)</n-radio>
          </n-radio-group>
        </n-form-item>

        <!-- 条件列表（只读展示） -->
        <n-form-item label="断言条件">
          <div class="assert-conditions-list">
            <div
              v-for="(condition, index) in formData.params.conditions"
              :key="index"
              class="assert-condition-item"
            >
              <n-tag :type="condition.type === 'element' ? 'success' : 'info'" size="small">
                {{ condition.type === 'element' ? '元素' : '图片' }}
              </n-tag>
              <span class="condition-detail">
                <template v-if="condition.type === 'element'">
                  {{ condition.selector.xpath }}
                </template>
                <template v-else>
                  {{ condition.template.name || '模板图片' }} ({{ (condition.template.threshold * 100).toFixed(0) }}%)
                </template>
              </span>
              <n-tag :type="condition.expect === 'exists' ? 'primary' : 'warning'" size="small">
                {{ condition.expect === 'exists' ? '存在' : '不存在' }}
              </n-tag>
            </div>
            <n-empty v-if="!formData.params.conditions?.length" description="无断言条件" size="small" />
          </div>
        </n-form-item>

        <!-- 等待配置 -->
        <n-form-item label="等待重试">
          <n-switch v-model:value="waitEnabled" />
        </n-form-item>

        <template v-if="waitEnabled">
          <n-form-item label="超时时间">
            <n-input-number
              v-model:value="formData.params.wait.timeout"
              :min="100"
              :max="30000"
              :step="100"
              style="width: 100%"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>
          <n-form-item label="重试间隔">
            <n-input-number
              v-model:value="formData.params.wait.interval"
              :min="100"
              :max="5000"
              :step="100"
              style="width: 100%"
            >
              <template #suffix>毫秒</template>
            </n-input-number>
          </n-form-item>
        </template>
      </template>

      <!-- 通用字段：完成后等待时间 -->
      <n-form-item :label="t.actions.waitAfter" path="waitAfter">
        <n-input-number
          v-model:value="formData.waitAfter"
          :min="0"
          :step="100"
          :precision="0"
          style="width: 100%"
        >
          <template #suffix>{{ t.actions.milliseconds }}</template>
        </n-input-number>
      </n-form-item>

      <n-divider title-placement="left">{{ t.actions.failureControl.title }}</n-divider>

      <!-- 失败行为配置 -->
      <n-form-item label="执行失败时停止回放" path="stopOnFailure">
        <n-switch v-model:value="formData.stopOnFailure" />
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
  NRadioGroup,
  NRadio,
  NSwitch,
  NEmpty,
  useMessage,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import type { RecordedAction, FailureBehavior } from '@/types/recording'
import { getActionTypeColor } from '@/utils/recordingFormatters'
import { deepClone } from '@/utils/object'
import { useI18nStore } from '@/stores/i18n'

interface Props {
  action: RecordedAction | null
  screenSize: { width: number; height: number }
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

const message = useMessage()

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
  waitAfter: 0,
  coords: { x: 0, y: 0, scaleX: 0, scaleY: 0 },
  endCoords: { x: 0, y: 0, scaleX: 0, scaleY: 0 },
  xpath: { selector: '' },
  params: {},
})

// 断言等待开关的计算属性
const waitEnabled = computed({
  get: () => formData.value.params?.wait?.enabled ?? false,
  set: (val: boolean) => {
    if (!formData.value.params) formData.value.params = {}
    if (val) {
      formData.value.params.wait = {
        enabled: true,
        timeout: formData.value.params.wait?.timeout ?? 3000,
        interval: formData.value.params.wait?.interval ?? 300,
      }
    } else {
      formData.value.params.wait = undefined
    }
  },
})

// 监听 action 变化，重置表单
watch(
  () => props.action,
  (newAction) => {
    if (!newAction) return

    // 深拷贝避免污染原数据
    formData.value = deepClone(newAction)

    // 确保 waitAfter 存在
    if (formData.value.waitAfter === undefined) {
      formData.value.waitAfter = 0
    }

    // 失败控制: 转换为开关状态 (true = stop, false = continue)
    formData.value.stopOnFailure = (newAction.onFailure || 'stop') === 'stop'

    // 确保嵌套对象存在
    if (!formData.value.coords) {
      formData.value.coords = { x: 0, y: 0, scaleX: 0, scaleY: 0 }
    }
    if (!formData.value.endCoords) {
      formData.value.endCoords = { x: 0, y: 0, scaleX: 0, scaleY: 0 }
    }
    if (!formData.value.xpath) {
      formData.value.xpath = { selector: '' }
    }
    if (!formData.value.params) {
      formData.value.params = {}
    }
    // 断言类型：确保 wait 结构存在
    if (newAction.type === 'assert' && formData.value.params.wait?.enabled) {
      formData.value.params.wait = {
        enabled: true,
        timeout: formData.value.params.wait.timeout ?? 3000,
        interval: formData.value.params.wait.interval ?? 300,
      }
    }
  },
  { immediate: true }
)

// 验证规则
const rules = computed<FormRules>(() => ({
  waitAfter: [
    {
      required: true,
      type: 'number',
      message: '完成后等待时间不能为空',
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
  'params.command': [
    { required: true, message: '命令不能为空', trigger: 'blur' },
  ],
}))
// 保存处理
async function handleSave() {
  if (!formRef.value || !editingAction.value) return

  try {
    await formRef.value.validate()

    // 计算更新内容
    const updates: Partial<RecordedAction> = {}

    // 完成后等待时间（所有类型都有）
    if (formData.value.waitAfter !== editingAction.value.waitAfter) {
      (updates as any).waitAfter = formData.value.waitAfter
    }

    // 失败行为配置
    const newOnFailure: FailureBehavior = formData.value.stopOnFailure ? 'stop' : 'continue'
    if (newOnFailure !== editingAction.value.onFailure) {
      (updates as any).onFailure = newOnFailure
    }

    // 根据类型复制修改的字段
    if (editingAction.value.type === 'tap') {
      // 检查坐标是否变化（需要检查原始 action 是否有 coords）
      const oldCoords = editingAction.value.coords
      const coordsChanged = oldCoords
        ? (formData.value.coords.x !== oldCoords.x || formData.value.coords.y !== oldCoords.y)
        : true // 如果原始 action 没有 coords（有 xpath），则认为坐标已变化

      if (coordsChanged) {
        // 坐标变化，重新计算 scale（验证屏幕尺寸防止除零）
        const { width, height } = props.screenSize
	        if (!width || !height || width <= 0 || height <= 0) {
	          const errorMsg = `无法保存：屏幕尺寸无效 (${width}x${height})。请确保设备已连接。`
	          console.error(errorMsg)
	          message.error(errorMsg)
	          return
	        }
        ;(updates as any).coords = {
          x: formData.value.coords.x,
          y: formData.value.coords.y,
          scaleX: formData.value.coords.x / width,
          scaleY: formData.value.coords.y / height,
        }
        // 同步更新 params
        ;(updates as any).params = {
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
          }
        } else {
          // 清空 XPath
          (updates as any).xpath = undefined
        }
      }
    } else if (editingAction.value.type === 'swipe') {
      // 检查坐标是否变化（需要检查原始 action 是否有 coords/endCoords）
      const oldCoords = editingAction.value.coords
      const oldEndCoords = editingAction.value.endCoords
      const coordsChanged = oldCoords && oldEndCoords
        ? (formData.value.coords.x !== oldCoords.x ||
           formData.value.coords.y !== oldCoords.y ||
           formData.value.endCoords.x !== oldEndCoords.x ||
           formData.value.endCoords.y !== oldEndCoords.y)
        : true // 如果原始 action 缺少 coords，则认为坐标已变化

      if (coordsChanged) {
        // 坐标变化，重新计算 scale（验证屏幕尺寸防止除零）
        const { width, height } = props.screenSize
        if (!width || !height || width <= 0 || height <= 0) {
          console.error(`Invalid screen size: ${width}x${height}. Cannot update coordinates.`)
          return
        }
        ;(updates as any).coords = {
          x: formData.value.coords.x,
          y: formData.value.coords.y,
          scaleX: formData.value.coords.x / width,
          scaleY: formData.value.coords.y / height,
        }
        ;(updates as any).endCoords = {
          x: formData.value.endCoords.x,
          y: formData.value.endCoords.y,
          scaleX: formData.value.endCoords.x / width,
          scaleY: formData.value.endCoords.y / height,
        }
        ;(updates as any).params = {
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
    } else if (editingAction.value.type === 'assert') {
      // 断言类型：保存 operator 和 wait 配置
      const currentParams = editingAction.value.params as any
      const newParams = formData.value.params

      // 检查是否有变更
      const operatorChanged = newParams.operator !== currentParams.operator
      const waitChanged =
        (newParams.wait?.enabled ?? false) !== (currentParams.wait?.enabled ?? false) ||
        newParams.wait?.timeout !== currentParams.wait?.timeout ||
        newParams.wait?.interval !== currentParams.wait?.interval

      if (operatorChanged || waitChanged) {
        (updates as any).params = {
          ...currentParams,
          operator: newParams.operator,
          wait: newParams.wait?.enabled
            ? {
                enabled: true,
                timeout: newParams.wait.timeout,
                interval: newParams.wait.interval,
              }
            : undefined,
        }
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

.assert-conditions-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.assert-condition-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--n-color-embedded);
  border-radius: 6px;
}

.condition-detail {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--n-text-color-2);
}
</style>
