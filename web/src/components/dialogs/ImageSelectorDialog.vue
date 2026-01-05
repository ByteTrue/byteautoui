<template>
  <n-modal v-model:show="visible" preset="dialog" title="选择图片模板" style="width: 600px">
    <div class="image-selector">
      <n-tabs v-model:value="mode" type="line">
        <n-tab-pane name="crop" tab="框选屏幕区域">
          <n-alert type="info" title="提示" style="margin-bottom: 12px">
            在屏幕上拖拽框选目标区域
          </n-alert>
          <n-button @click="startCropMode">开始框选</n-button>
        </n-tab-pane>

        <n-tab-pane name="upload" tab="上传图片文件">
          <n-upload
            :max="1"
            accept="image/png,image/jpeg"
            :show-file-list="false"
            @before-upload="handleBeforeUpload"
          >
            <n-button>选择图片文件</n-button>
          </n-upload>
        </n-tab-pane>
      </n-tabs>

      <!-- 预览区域 -->
      <div v-if="templateData" class="preview-section">
        <n-divider />
        <h4>模板预览</h4>
        <img :src="templateData" alt="模板图片" class="preview-image" />
      </div>

      <n-form-item label="相似度阈值">
        <n-slider v-model:value="threshold" :min="0.5" :max="1.0" :step="0.05" />
        <span style="margin-left: 12px">{{ threshold }}</span>
      </n-form-item>

      <n-form-item label="模板名称 (可选)">
        <n-input v-model:value="templateName" placeholder="登录按钮" />
      </n-form-item>

      <n-form-item label="期望结果">
        <n-radio-group v-model:value="expect">
          <n-radio value="exists">图片存在</n-radio>
          <n-radio value="not_exists">图片不存在</n-radio>
        </n-radio-group>
      </n-form-item>
    </div>

    <template #action>
      <n-space>
        <n-button @click="handleCancel">取消</n-button>
        <n-button type="primary" :disabled="!templateData" @click="handleConfirm">确认</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  NModal,
  NTabs,
  NTabPane,
  NFormItem,
  NInput,
  NRadioGroup,
  NRadio,
  NButton,
  NSpace,
  NAlert,
  NUpload,
  NSlider,
  NDivider,
  type UploadFileInfo,
} from 'naive-ui'
import type { ImageCondition } from '@/types/recording'
import { DEFAULT_THRESHOLD } from '@/constants/assertion'

const visible = ref(false)
const mode = ref<'crop' | 'upload'>('crop')
const templateData = ref<string>('')
const templateName = ref('')
const threshold = ref(DEFAULT_THRESHOLD)
const expect = ref<'exists' | 'not_exists'>('exists')

const emit = defineEmits<{
  confirm: [condition: ImageCondition]
  'start-crop': []
}>()

function show() {
  visible.value = true
}

function hide() {
  visible.value = false
  // 重置
  templateData.value = ''
  templateName.value = ''
  threshold.value = DEFAULT_THRESHOLD
  expect.value = 'exists'
}

function startCropMode() {
  emit('start-crop')
  hide()
}

function handleBeforeUpload(options: { file: UploadFileInfo }): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = options.file.file
    if (!file) {
      reject(new Error('No file'))
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      templateData.value = e.target?.result as string
      resolve()
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function handleCancel() {
  hide()
}

function handleConfirm() {
  const condition: ImageCondition = {
    type: 'image',
    template: {
      data: templateData.value,
      threshold: threshold.value,
      name: templateName.value || undefined,
    },
    expect: expect.value,
  }

  emit('confirm', condition)
  hide()
}

function setTemplateData(data: string) {
  templateData.value = data
}

defineExpose({ show, hide, setTemplateData })
</script>

<style scoped>
.image-selector {
  padding: 16px 0;
}

.preview-section {
  margin-top: 16px;
}

.preview-image {
  max-width: 100%;
  max-height: 300px;
  border: 1px solid var(--n-border-color);
  border-radius: 4px;
}
</style>
