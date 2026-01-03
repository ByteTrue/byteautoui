<template>
  <div class="home-container">
    <div class="welcome-card">
      <div class="logo-section">
        <n-icon size="80" color="var(--md-primary)">
          <PhoneLandscapeOutline />
        </n-icon>
        <h1 class="app-title">UI Auto Dev</h1>
        <p class="app-subtitle">跨平台 UI 自动化测试工具</p>
      </div>

      <div class="action-section">
        <p class="instruction-text">请先连接设备，然后点击下方按钮选择设备</p>
        <n-button type="primary" size="large" @click="showDeviceSelector = true">
          <template #icon>
            <n-icon><AddCircleOutline /></n-icon>
          </template>
          选择设备
        </n-button>
      </div>

      <div class="info-section">
        <n-space vertical :size="12">
          <div class="info-item">
            <n-icon size="20" color="var(--md-text-secondary)">
              <LogoAndroid />
            </n-icon>
            <span>支持 Android、iOS、HarmonyOS 设备</span>
          </div>
          <div class="info-item">
            <n-icon size="20" color="var(--md-text-secondary)">
              <RadioButtonOnOutline />
            </n-icon>
            <span>录制和回放操作序列</span>
          </div>
          <div class="info-item">
            <n-icon size="20" color="var(--md-text-secondary)">
              <LayersOutline />
            </n-icon>
            <span>实时查看 UI 层级结构</span>
          </div>
        </n-space>
      </div>
    </div>

    <!-- 设备选择对话框 -->
    <DeviceSelector v-model:show="showDeviceSelector" @select="handleDeviceSelect" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, NSpace } from 'naive-ui'
import {
  PhoneLandscapeOutline,
  AddCircleOutline,
  LogoAndroid,
  RadioButtonOnOutline,
  LayersOutline,
} from '@vicons/ionicons5'
import DeviceSelector from '@/components/DeviceSelector.vue'
import type { Platform } from '@/api/types'

const router = useRouter()
const showDeviceSelector = ref(false)

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
  color: var(--md-text-primary);
  background: linear-gradient(135deg, var(--md-primary) 0%, var(--md-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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
