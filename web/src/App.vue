<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { NConfigProvider, NMessageProvider, NDialogProvider, zhCN, dateZhCN } from 'naive-ui'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()

// 初始化主题(从localStorage读取)
onMounted(() => {
  themeStore.initTheme()
  // 设置初始的data-theme属性
  updateThemeAttribute()
})

// 监听主题变化,更新HTML的data-theme属性
watch(() => themeStore.isDark, () => {
  updateThemeAttribute()
})

function updateThemeAttribute() {
  if (themeStore.isDark) {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}
</script>

<template>
  <n-config-provider
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme="themeStore.naiveTheme"
    :theme-overrides="themeStore.themeOverrides"
  >
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  font-family: var(--md-font-family);
  /* 平滑过渡主题切换 */
  transition: background-color 0.3s ease, color 0.3s ease;
}
</style>
