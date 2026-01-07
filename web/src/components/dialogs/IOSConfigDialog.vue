<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NButton,
  NSpace,
  NAlert,
  NIcon,
  useMessage,
} from 'naive-ui'
import { SettingsOutline } from '@vicons/ionicons5'
import { useI18nStore } from '@/stores/i18n'

defineProps<{
  show: boolean
  serial: string
  errorMessage?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [bundleId: string, port: number]
}>()

const message = useMessage()
const i18nStore = useI18nStore()

const t = computed(() => i18nStore.t.iosConfig)

const formData = ref<{ bundleId: string; port: number | null }>({
  bundleId: 'com.facebook.WebDriverAgentRunner.xctrunner',
  port: 8100,
})

const loading = ref(false)

function handleClose() {
  emit('update:show', false)
}

async function handleSave() {
  if (!formData.value.bundleId.trim()) {
    message.warning('Please enter WDA Bundle ID')
    return
  }
  if (!Number.isFinite(formData.value.port) || (formData.value.port as number) <= 0) {
    message.warning('Please enter WDA Port')
    return
  }

  loading.value = true
  try {
    emit('confirm', formData.value.bundleId, formData.value.port as number)
    message.success('Configuration saved')
    emit('update:show', false)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <n-modal
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    preset="card"
    size="medium"
    :bordered="false"
    :segmented="{ content: true }"
    style="max-width: 600px"
    :closable="false"
  >
    <template #header>
      <n-space align="center" :size="12">
        <n-icon size="24" color="var(--md-primary)">
          <settings-outline />
        </n-icon>
        <span class="modal-title">{{ t.title }}</span>
      </n-space>
    </template>

    <div class="config-content">
      <!-- Error Alert -->
      <n-alert v-if="errorMessage" :title="t.wdaStartFailed" type="error" :bordered="false" style="margin-bottom: 20px">
        {{ errorMessage }}
      </n-alert>

      <!-- Info Alert -->
      <n-alert type="info" :bordered="false" style="margin-bottom: 24px">
        <template #header>
          <span style="font-weight: 600;">{{ t.firstTimeSetup }}</span>
        </template>
        <div style="font-size: 13px; line-height: 1.6;">
          <p style="margin: 0 0 8px 0;">{{ t.setupDescription }}</p>
          <p style="margin: 0;"><strong>{{ t.setupGuide }}</strong> <a href="https://github.com/appium/WebDriverAgent#getting-started" target="_blank">appium/WebDriverAgent</a></p>
        </div>
      </n-alert>

      <!-- Configuration Form -->
      <n-form label-placement="left" label-width="120" :model="formData">
        <n-form-item :label="t.deviceUDID" path="serial">
          <n-input :value="serial" readonly disabled />
        </n-form-item>

        <n-form-item :label="t.wdaBundleId" path="bundleId" required>
          <n-input
            v-model:value="formData.bundleId"
            placeholder="com.facebook.WebDriverAgentRunner.xctrunner"
            :style="{ fontFamily: 'var(--md-font-family-mono)', fontSize: '13px' }"
          />
        </n-form-item>

        <n-form-item :label="t.wdaPort" path="port">
          <n-input-number
            v-model:value="formData.port"
            :min="1"
            :max="65535"
            placeholder="8100"
          />
        </n-form-item>
      </n-form>

      <!-- Common Bundle IDs -->
      <div class="bundle-hints">
        <div class="hints-title">{{ t.commonBundleIds }}</div>
        <div class="hint-item" @click="formData.bundleId = 'com.facebook.WebDriverAgentRunner.xctrunner'">
          <code>com.facebook.WebDriverAgentRunner.xctrunner</code>
          <span class="hint-label">{{ t.defaultBundleId }}</span>
        </div>
        <div class="hint-item" @click="formData.bundleId = 'com.appium.WebDriverAgentRunner.xctrunner'">
          <code>com.appium.WebDriverAgentRunner.xctrunner</code>
          <span class="hint-label">{{ t.appiumBundleId }}</span>
        </div>
      </div>

      <!-- Help Section -->
      <div class="help-section">
        <p class="help-title">{{ t.helpTitle }}</p>
        <ol class="help-list">
          <li>{{ t.helpSteps.step1 }}</li>
          <li>{{ t.helpSteps.step2 }}</li>
          <li>{{ t.helpSteps.step3 }}</li>
        </ol>
        <p class="help-note">
          <strong>{{ t.helpNote }}</strong>
        </p>
      </div>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button @click="handleClose" :disabled="loading">
          {{ t.cancel }}
        </n-button>
        <n-button type="primary" @click="handleSave" :loading="loading">
          {{ t.saveConfiguration }}
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.modal-title {
  font-size: var(--md-font-size-lg);
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
}

.config-content {
  padding: var(--md-space-sm) 0;
}

.bundle-hints {
  margin-top: var(--md-space-lg);
  padding: var(--md-space-md);
  background: var(--md-surface-variant);
  border-radius: var(--md-shape-corner-medium);
}

.hints-title {
  font-size: var(--md-font-size-sm);
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-secondary);
  margin-bottom: var(--md-space-sm);
}

.hint-item {
  padding: var(--md-space-xs) var(--md-space-sm);
  margin: var(--md-space-xs) 0;
  background: var(--md-surface);
  border-radius: var(--md-shape-corner-small);
  cursor: pointer;
  transition: all var(--md-duration-short) var(--md-easing-standard);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--md-space-sm);
}

.hint-item:hover {
  background: var(--md-primary-container);
  transform: translateX(4px);
}

.hint-item code {
  font-family: var(--md-font-family-mono);
  font-size: 12px;
  color: var(--md-primary);
  flex: 1;
}

.hint-label {
  font-size: var(--md-font-size-xs);
  color: var(--md-text-tertiary);
  font-style: italic;
}

.help-section {
  margin-top: var(--md-space-lg);
  padding: var(--md-space-md);
  background: var(--md-surface-container);
  border-left: 3px solid var(--md-primary);
  border-radius: var(--md-shape-corner-small);
}

.help-title {
  font-size: var(--md-font-size-sm);
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
  margin: 0 0 var(--md-space-sm) 0;
}

.help-list {
  margin: var(--md-space-sm) 0;
  padding-left: var(--md-space-lg);
  font-size: var(--md-font-size-sm);
  color: var(--md-text-secondary);
  line-height: var(--md-line-height-relaxed);
}

.help-list li {
  margin: var(--md-space-xs) 0;
}

.help-note {
  font-size: var(--md-font-size-xs);
  color: var(--md-text-secondary);
  margin: var(--md-space-sm) 0 0 0;
  line-height: var(--md-line-height-relaxed);
}
</style>
