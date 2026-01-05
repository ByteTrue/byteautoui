<template>
  <n-modal v-model:show="visible" preset="dialog" title="选择元素">
    <div class="element-selector">
      <n-alert type="info" title="提示">
        点击屏幕上的元素，或在下方输入 XPath
      </n-alert>

      <n-form-item label="XPath">
        <n-input v-model:value="xpath" placeholder="//*[@resource-id='com.example:id/button']" />
      </n-form-item>

      <n-form-item label="属性验证 (可选)">
        <n-space vertical>
          <n-checkbox v-model:checked="validateText">文本</n-checkbox>
          <n-input v-if="validateText" v-model:value="text" placeholder="按钮文本" />

          <n-checkbox v-model:checked="validateResourceId">Resource ID</n-checkbox>
          <n-input v-if="validateResourceId" v-model:value="resourceId" placeholder="com.example:id/button" />

          <n-checkbox v-model:checked="validateClassName">Class Name</n-checkbox>
          <n-input v-if="validateClassName" v-model:value="className" placeholder="android.widget.Button" />
        </n-space>
      </n-form-item>

      <n-form-item label="期望结果">
        <n-radio-group v-model:value="expect">
          <n-radio value="exists">元素存在</n-radio>
          <n-radio value="not_exists">元素不存在</n-radio>
        </n-radio-group>
      </n-form-item>
    </div>

    <template #action>
      <n-space>
        <n-button @click="handleCancel">取消</n-button>
        <n-button type="primary" :disabled="!xpath" @click="handleConfirm">确认</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NModal, NFormItem, NInput, NRadioGroup, NRadio, NButton, NSpace, NAlert, NCheckbox } from 'naive-ui'
import type { ElementCondition } from '@/types/recording'

const visible = ref(false)
const xpath = ref('')
const expect = ref<'exists' | 'not_exists'>('exists')

const validateText = ref(false)
const text = ref('')
const validateResourceId = ref(false)
const resourceId = ref('')
const validateClassName = ref(false)
const className = ref('')

const emit = defineEmits<{
  confirm: [condition: ElementCondition]
}>()

function show() {
  visible.value = true
}

function hide() {
  visible.value = false
  // 重置
  xpath.value = ''
  expect.value = 'exists'
  validateText.value = false
  text.value = ''
  validateResourceId.value = false
  resourceId.value = ''
  validateClassName.value = false
  className.value = ''
}

function handleCancel() {
  hide()
}

function handleConfirm() {
  const attributes: Record<string, string> = {}
  if (validateText.value && text.value) attributes.text = text.value
  if (validateResourceId.value && resourceId.value) attributes.resourceId = resourceId.value
  if (validateClassName.value && className.value) attributes.className = className.value

  const condition: ElementCondition = {
    type: 'element',
    selector: {
      xpath: xpath.value,
      attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
    },
    expect: expect.value,
  }

  emit('confirm', condition)
  hide()
}

/**
 * 预填充元素信息
 */
function prefill(data: {
  xpath: string
  attributes?: { text?: string; resourceId?: string; className?: string }
}) {
  xpath.value = data.xpath

  if (data.attributes) {
    if (data.attributes.text) {
      validateText.value = true
      text.value = data.attributes.text
    }
    if (data.attributes.resourceId) {
      validateResourceId.value = true
      resourceId.value = data.attributes.resourceId
    }
    if (data.attributes.className) {
      validateClassName.value = true
      className.value = data.attributes.className
    }
  }
}

defineExpose({ show, hide, prefill })
</script>

<style scoped>
.element-selector {
  padding: 16px 0;
}
</style>
