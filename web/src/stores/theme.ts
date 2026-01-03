import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { darkTheme as naiveDarkTheme } from 'naive-ui'
import type { GlobalTheme } from 'naive-ui'
import { lightTheme, darkTheme } from '@/theme'

/**
 * 主题状态管理
 *
 * 职责:
 * 1. 管理亮色/暗色模式切换
 * 2. 提供Naive UI所需的theme和themeOverrides配置
 * 3. 持久化用户偏好到localStorage
 */
export const useThemeStore = defineStore('theme', () => {
  // 是否为暗色模式
  const isDark = ref(false)

  // Naive UI基础主题
  // 亮色模式传undefined使用默认主题，暗色模式传darkTheme
  const naiveTheme = computed<GlobalTheme | undefined>(() =>
    isDark.value ? naiveDarkTheme : undefined
  )

  // 主题覆盖配置
  // 根据当前模式返回对应的themeOverrides
  const themeOverrides = computed(() =>
    isDark.value ? darkTheme : lightTheme
  )

  /**
   * 切换主题
   * 同时保存到localStorage
   */
  function toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
  }

  /**
   * 初始化主题
   * 从localStorage读取用户上次选择的主题
   */
  function initTheme() {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') {
      isDark.value = true
    } else if (saved === 'light') {
      isDark.value = false
    }
    // 如果localStorage没有保存，使用默认值(亮色)
  }

  return {
    isDark,
    naiveTheme,
    themeOverrides,
    toggleTheme,
    initTheme,
  }
})
