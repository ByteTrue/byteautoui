<template>
  <div class="home-container">
    <!-- Language Switcher -->
    <div class="language-switcher">
      <n-radio-group v-model:value="i18nStore.locale" size="small">
        <n-radio-button value="zh">中文</n-radio-button>
        <n-radio-button value="en">English</n-radio-button>
      </n-radio-group>
    </div>

    <div class="welcome-card">
      <div class="logo-section">
        <n-icon size="80" color="var(--md-primary)">
          <PhoneLandscapeOutline />
        </n-icon>
        <h1 class="app-title">{{ t.home.title }}</h1>
        <p class="app-subtitle">{{ t.home.subtitle }}</p>
      </div>

      <div class="action-section">
        <p class="instruction-text">{{ t.home.instruction }}</p>
        <n-button type="primary" size="large" @click="showDeviceSelector = true">
          <template #icon>
            <n-icon><AddCircleOutline /></n-icon>
          </template>
          {{ t.home.selectDevice }}
        </n-button>
      </div>

      <div class="info-section">
        <n-space vertical :size="12">
          <div class="info-item">
            <n-icon size="20" color="var(--md-text-secondary)">
              <LogoAndroid />
            </n-icon>
            <span>{{ t.home.features.multiPlatform }}</span>
          </div>
          <div class="info-item">
            <n-icon size="20" color="var(--md-text-secondary)">
              <RadioButtonOnOutline />
            </n-icon>
            <span>{{ t.home.features.recording }}</span>
          </div>
          <div class="info-item">
            <n-icon size="20" color="var(--md-text-secondary)">
              <LayersOutline />
            </n-icon>
            <span>{{ t.home.features.hierarchy }}</span>
          </div>
        </n-space>
      </div>
    </div>

    <!-- 设备选择对话框 -->
    <DeviceSelector v-model:show="showDeviceSelector" @select="handleDeviceSelect" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, NSpace, NRadioGroup, NRadioButton } from 'naive-ui'
import {
  PhoneLandscapeOutline,
  AddCircleOutline,
  LogoAndroid,
  RadioButtonOnOutline,
  LayersOutline,
} from '@vicons/ionicons5'
import DeviceSelector from '@/components/DeviceSelector.vue'
import { useI18nStore } from '@/stores/i18n'
import type { Platform } from '@/api/types'

const router = useRouter()
const showDeviceSelector = ref(false)
const i18nStore = useI18nStore()

const t = computed(() => i18nStore.t)

function handleDeviceSelect(platform: Platform, serial: string) {
  router.push(`/${platform}/${serial}`)
}
</script>

<style scoped>
.home-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--md-surface);
  padding: var(--md-space-lg);
  position: relative;
}

.language-switcher {
  position: absolute;
  top: var(--md-space-lg);
  right: var(--md-space-lg);
  z-index: 10;
}

.welcome-card {
  max-width: 500px;
  width: 100%;
  background: var(--md-surface-container);
  border-radius: var(--md-shape-corner-extra-large);
  padding: var(--md-space-xxl);
  box-shadow: var(--md-elevation-2);
  display: flex;
  flex-direction: column;
  gap: var(--md-space-xl);
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--md-space-md);
  text-align: center;
}

.app-title {
  margin: 0;
  font-size: var(--md-font-size-xxl);
  font-weight: var(--md-font-weight-bold);
  /* 直接使用主色文字，简单可靠 */
  color: var(--md-primary);
}

.app-subtitle {
  margin: 0;
  font-size: var(--md-font-size-md);
  color: var(--md-text-secondary);
}

.action-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--md-space-md);
  padding: var(--md-space-lg) 0;
  border-top: 1px solid var(--md-outline);
  border-bottom: 1px solid var(--md-outline);
}

.instruction-text {
  margin: 0;
  font-size: var(--md-font-size-md);
  color: var(--md-text-secondary);
  text-align: center;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: var(--md-space-sm);
}

.info-item {
  display: flex;
  align-items: center;
  gap: var(--md-space-sm);
  font-size: var(--md-font-size-sm);
  color: var(--md-text-secondary);
}
</style>
