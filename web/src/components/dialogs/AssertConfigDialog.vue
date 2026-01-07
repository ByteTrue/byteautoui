<template>
  <n-modal v-model:show="visible" preset="dialog" :title="dialogTitle" :style="{ width: '700px', maxWidth: '90vw' }">
    <div class="assert-config">
      <!-- 断言描述 -->
      <n-form-item label="描述（可选）">
        <n-input
          v-model:value="description"
          placeholder="给断言起个名字，如：检查登录按钮存在"
          clearable
        />
      </n-form-item>

      <!-- 逻辑运算符选择 -->
      <n-form-item label="逻辑运算">
        <n-radio-group v-model:value="operator">
          <n-radio value="and">AND (所有条件满足)</n-radio>
          <n-radio value="or">OR (任一条件满足)</n-radio>
        </n-radio-group>
      </n-form-item>

      <!-- 条件列表 -->
      <n-form-item label="断言条件">
        <div class="conditions-list">
          <div v-for="(condition, index) in conditions" :key="index" class="condition-item">
            <n-tag :type="getConditionTypeColor(condition.type)" size="small">
              {{ condition.type === 'element' ? '元素' : '图片' }}
            </n-tag>
            <n-tag
              :type="getExpectTypeColor(condition.expect)"
              size="small"
              :bordered="false"
              class="expect-tag clickable"
              @click="toggleExpect(index)"
            >
              {{ condition.expect === 'exists' ? '✓ 存在' : '✗ 不存在' }}
            </n-tag>
            <n-tooltip placement="top" :delay="300">
              <template #trigger>
                <span class="condition-summary">{{ getConditionSelector(condition) }}</span>
              </template>
              {{ getConditionSelector(condition) }}
            </n-tooltip>
            <n-space :size="4">
              <n-button size="small" @click="removeCondition(index)">删除</n-button>
            </n-space>
          </div>
        </div>
      </n-form-item>

      <!-- 添加条件按钮 -->
      <n-space>
        <n-button @click="addElementCondition">添加元素断言</n-button>
        <n-button @click="addImageCondition">添加图片断言</n-button>
      </n-space>

      <!-- 等待配置 -->
      <div class="wait-config-section">
        <div class="wait-toggle-row">
          <span class="wait-label">等待重试</span>
          <n-switch v-model:value="waitEnabled" />
        </div>

        <template v-if="waitEnabled">
          <div class="wait-params">
            <n-form-item label="超时时间 (毫秒)" label-placement="left">
              <n-input-number v-model:value="waitTimeout" :min="100" :max="30000" :step="100" />
            </n-form-item>
            <n-form-item label="重试间隔 (毫秒)" label-placement="left">
              <n-input-number v-model:value="waitInterval" :min="100" :max="5000" :step="100" />
            </n-form-item>
          </div>
        </template>
      </div>

      <!-- 失败行为配置 -->
      <n-divider title-placement="left">{{ t.actions.failureControl.title }}</n-divider>
      <div class="failure-config-row">
        <div class="failure-toggle-row">
          <span class="failure-label">执行失败时停止回放</span>
          <n-switch v-model:value="stopOnFailure" />
        </div>
      </div>

    </div>

    <template #action>
      <n-space>
        <n-button @click="handleCancel">取消</n-button>
        <n-button type="primary" :disabled="conditions.length === 0" @click="handleConfirm">
          确认
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  NModal,
  NFormItem,
  NRadioGroup,
  NRadio,
  NTag,
  NButton,
  NSpace,
  NSwitch,
  NInputNumber,
  NInput,
  NDivider,
  NTooltip,
} from 'naive-ui'
import type { AssertCondition, AssertParams, RecordedAction, FailureBehavior } from '@/types/recording'
import { DEFAULT_TIMEOUT_MS, DEFAULT_INTERVAL_MS } from '@/constants/assertion'
import { useI18nStore } from '@/stores/i18n'

const i18nStore = useI18nStore()
const t = computed(() => ({
  common: i18nStore.t.common,
  actions: i18nStore.t.actions,
}))

const visible = ref(false)
const description = ref('')
const operator = ref<'and' | 'or'>('and')
const conditions = ref<AssertCondition[]>([])
const waitEnabled = ref(false)
const waitTimeout = ref(DEFAULT_TIMEOUT_MS)
const waitInterval = ref(DEFAULT_INTERVAL_MS)

// 失败控制: true = 停止回放 (stop), false = 继续执行 (continue)
const stopOnFailure = ref(true)

// 编辑模式状态
const editMode = ref(false)
const editingActionId = ref<string | null>(null)

// 动态标题
const dialogTitle = computed(() => editMode.value ? '编辑断言' : '配置断言')

const emit = defineEmits<{
  confirm: [params: AssertParams, onFailure?: FailureBehavior]
  update: [id: string, updates: Partial<RecordedAction>]
  'add-element': []
  'add-image': []
}>()

function show() {
  visible.value = true
}

function hide() {
  visible.value = false
}

/**
 * 重置为初始状态
 */
function reset() {
  description.value = ''
  operator.value = 'and'
  conditions.value = []
  waitEnabled.value = false
  waitTimeout.value = DEFAULT_TIMEOUT_MS
  waitInterval.value = DEFAULT_INTERVAL_MS
  stopOnFailure.value = true
  editMode.value = false
  editingActionId.value = null
}

/**
 * 编辑现有断言
 */
function edit(action: RecordedAction) {
  if (action.type !== 'assert') return

  const params = action.params as AssertParams

  // 预填充数据
  editMode.value = true
  editingActionId.value = action.id
  description.value = params.description || ''
  operator.value = params.operator
  conditions.value = [...params.conditions] // 浅拷贝
  waitEnabled.value = params.wait?.enabled ?? false
  waitTimeout.value = params.wait?.timeout ?? DEFAULT_TIMEOUT_MS
  waitInterval.value = params.wait?.interval ?? DEFAULT_INTERVAL_MS
  stopOnFailure.value = (action.onFailure || 'stop') === 'stop'

  visible.value = true
}

function addElementCondition() {
  emit('add-element')
}

function addImageCondition() {
  emit('add-image')
}

function addCondition(condition: AssertCondition) {
  conditions.value.push(condition)
}

function removeCondition(index: number) {
  conditions.value.splice(index, 1)
}

/**
 * 切换条件的期望状态（存在 <-> 不存在）
 */
function toggleExpect(index: number) {
  const condition = conditions.value[index]
  if (condition) {
    condition.expect = condition.expect === 'exists' ? 'not_exists' : 'exists'
  }
}

/*
// 格式化条件文本（供将来使用）
function formatCondition(condition: AssertCondition): string {
  if (condition.type === 'element') {
    const expectText = condition.expect === 'exists' ? '存在' : '不存在'
    return `${condition.selector.xpath} ${expectText}`
  } else {
    const expectText = condition.expect === 'exists' ? '存在' : '不存在'
    const name = condition.template.name || '模板图片'
    return `${name} ${expectText}`
  }
}
*/

/**
 * 获取条件选择器部分（不包含存在/不存在）
 */
function getConditionSelector(condition: AssertCondition): string {
  if (condition.type === 'element') {
    return condition.selector.xpath
  } else {
    return condition.template.name || '模板图片'
  }
}

/**
 * 获取期望类型的颜色标签
 */
function getExpectTypeColor(expect: 'exists' | 'not_exists'): 'success' | 'error' {
  return expect === 'exists' ? 'success' : 'error'
}

function getConditionTypeColor(type: string) {
  return type === 'element' ? 'success' : 'info'
}

function handleCancel() {
  hide()
  reset()
}

function handleConfirm() {
  const params: AssertParams = {
    description: description.value.trim() || undefined,
    operator: operator.value,
    conditions: conditions.value,
    wait: waitEnabled.value
      ? {
          enabled: true,
          timeout: waitTimeout.value,
          interval: waitInterval.value,
        }
      : undefined,
  }

  const onFailure: FailureBehavior = stopOnFailure.value ? 'stop' : 'continue'

  if (editMode.value && editingActionId.value) {
    const updates: Partial<RecordedAction> = {
      params,
      onFailure,
    }
    emit('update', editingActionId.value, updates)
  } else {
    emit('confirm', params, onFailure)
  }

  hide()
  reset()
}

defineExpose({ show, hide, addCondition, edit, reset })
</script>

<style scoped>
.assert-config {
  padding: 16px 0;
}

.conditions-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.condition-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: var(--n-color-embedded);
  border-radius: 4px;
}

.expect-tag.clickable {
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.expect-tag.clickable:hover {
  opacity: 0.8;
  transform: scale(1.05);
}

.expect-tag.clickable:active {
  transform: scale(0.95);
}

.condition-summary {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: help;
  color: var(--n-text-color);
  font-family: monospace;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 2px;
  transition: background-color 0.2s;
}

.condition-summary:hover {
  background-color: var(--n-color-embedded-popover);
}

.wait-config-section {
  margin-top: 16px;
  padding: 12px;
  background: var(--n-color-embedded);
  border-radius: 8px;
}

.wait-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wait-label {
  font-weight: 500;
  color: var(--n-text-color);
}

.wait-params {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--n-border-color);
}

.failure-config-row {
  margin-top: 16px;
  padding: 12px;
  background: var(--n-color-embedded);
  border-radius: 8px;
}

.failure-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.failure-label {
  font-weight: 500;
  color: var(--n-text-color);
}
</style>
