import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 国际化文本定义
 */
const messages = {
  zh: {
    // 通用
    common: {
      confirm: '确定',
      cancel: '取消',
      save: '保存',
      delete: '删除',
      edit: '编辑',
      close: '关闭',
      search: '搜索',
      refresh: '刷新',
      loading: '加载中...',
      clear: '清除',
      yes: '是',
      no: '否',
    },

    // 设备页面
    device: {
      selectDevice: '选择设备',
      hierarchy: '层级',
      actions: '录制回放',
      package: '包管理',

      // 控制按钮
      home: '主页',
      back: '返回',
      apps: '应用',
      wake: '唤醒',
      stop: '停止',
      volumeUp: '音量+',
      volumeDown: '音量-',
      volumeMute: '静音',
      swipeUp: '上滑',
      swipeDown: '下滑',
      swipeLeft: '左滑',
      swipeRight: '右滑',

      // 刷新
      refresh: '刷新 (按键盘R也可以刷新画面)',

      // 元素操作
      tapElement: '点击元素',
    },

    // 屏幕面板
    screen: {
      viewMode: '检查',
      pointerMode: '控制',
    },

    // 元素树面板
    hierarchy: {
      searchPlaceholder: '输入搜索内容...',
      searchType: {
        text: '文本 (text)',
        xpath: 'XPath',
        id: 'Resource ID',
        className: 'Class Name',
      },
      foundResults: '找到 {count} 个结果',
      noResults: '未找到匹配的元素',
      noElement: '暂无层级数据',
    },

    // 录制回放面板
    actions: {
      // 录制标签
      recordTab: '录制',
      playbackTab: '回放',
      editTab: '编辑',

      // 录制控制
      startRecording: '开始录制',
      stopRecording: '停止录制',
      pauseRecording: '暂停',
      continueRecording: '继续',
      clearRecording: '清空',
      saveRecording: '保存',

      // 录制状态
      recording: '正在录制...',
      recordingPaused: '录制已暂停',

      // 操作步骤
      operationSteps: '操作步骤',
      noOperations: '暂无录制操作',

      // 回放控制
      play: '播放',
      pause: '暂停',
      stop: '停止',
      step: '单步',
      progress: '进度',

      // 录制列表
      recordingList: '录制列表',
      noRecordings: '暂无录制文件',
      load: '加载',

      // 编辑
      editRecording: '编辑录制',
      noEditingRecording: '请从回放列表中选择一个录制进行编辑',
      group: '分组',
      name: '名称',
      operationCount: '操作数',

      // 对话框
      confirmClear: '确认清空',
      confirmClearMessage: '确定要清空所有录制的操作吗?此操作不可撤销。',
      confirmDelete: '确认删除',
      confirmDeleteMessage: '确定要删除录制 "{name}" 吗?此操作不可撤销。',

      // 保存对话框
      saveDialogTitle: '保存录制',
      groupPlaceholder: 'default',
      namePlaceholder: 'Recording_xxx',

      // 消息提示
      recordingStopped: '录制已停止,共 {count} 步操作',
      recordingStarted: '开始录制操作',
      recordingCleared: '已清空录制',
      recordingSaved: '录制已保存: {name}',
      recordingLoaded: '已加载录制: {name}',
      recordingDeleted: '录制已删除',
      playbackComplete: '回放完成',

      // 操作类型
      actionTypes: {
        tap: '点击',
        swipe: '滑动',
        input: '输入',
        sleep: '等待',
        command: '命令',
        back: '返回',
        home: '主页',
      },
    },

    // 包管理面板
    package: {
      currentApp: '当前应用',
      packageName: '包名',
      launchActivity: '启动Activity',
      version: '版本',
      installTime: '安装时间',
      actions: '操作',

      noAppSelected: '未选择应用',
      pleaseSelectApp: '请从下方列表选择一个应用',

      installedApps: '已安装应用',
      noApps: '未找到应用',

      launch: '启动',
      stop: '停止',
      clear: '清除数据',
      uninstall: '卸载',

      confirmUninstall: '确认卸载',
      confirmUninstallMessage: '确定要卸载应用 "{name}" 吗?',
      confirmClearData: '确认清除',
      confirmClearDataMessage: '确定要清除应用 "{name}" 的数据吗?',

      appLaunched: '应用已启动',
      appStopped: '应用已停止',
      dataCleared: '数据已清除',
      appUninstalled: '应用已卸载',
    },
  },

  en: {
    // Common
    common: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      search: 'Search',
      refresh: 'Refresh',
      loading: 'Loading...',
      clear: 'Clear',
      yes: 'Yes',
      no: 'No',
    },

    // Device page
    device: {
      selectDevice: 'Select Device',
      hierarchy: 'Hierarchy',
      actions: 'Actions',
      package: 'Package',

      // Control buttons
      home: 'Home',
      back: 'Back',
      apps: 'Apps',
      wake: 'Wake',
      stop: 'Stop',
      volumeUp: 'Vol +',
      volumeDown: 'Vol -',
      volumeMute: 'Mute',
      swipeUp: 'Swipe Up',
      swipeDown: 'Swipe Down',
      swipeLeft: 'Swipe Left',
      swipeRight: 'Swipe Right',

      // Refresh
      refresh: 'Refresh (Press R to refresh)',

      // Element actions
      tapElement: 'Tap Element',
    },

    // Screen panel
    screen: {
      viewMode: 'Inspect',
      pointerMode: 'Control',
    },

    // Hierarchy panel
    hierarchy: {
      searchPlaceholder: 'Enter search text...',
      searchType: {
        text: 'Text',
        xpath: 'XPath',
        id: 'Resource ID',
        className: 'Class Name',
      },
      foundResults: 'Found {count} results',
      noResults: 'No matching elements found',
      noElement: 'No hierarchy data',
    },

    // Actions panel
    actions: {
      // Tabs
      recordTab: 'Record',
      playbackTab: 'Playback',
      editTab: 'Edit',

      // Recording controls
      startRecording: 'Start Recording',
      stopRecording: 'Stop Recording',
      pauseRecording: 'Pause',
      continueRecording: 'Continue',
      clearRecording: 'Clear',
      saveRecording: 'Save',

      // Recording status
      recording: 'Recording...',
      recordingPaused: 'Recording Paused',

      // Operation steps
      operationSteps: 'Steps',
      noOperations: 'No recorded operations',

      // Playback controls
      play: 'Play',
      pause: 'Pause',
      stop: 'Stop',
      step: 'Step',
      progress: 'Progress',

      // Recording list
      recordingList: 'Recordings',
      noRecordings: 'No recordings found',
      load: 'Load',

      // Edit
      editRecording: 'Edit Recording',
      noEditingRecording: 'Please select a recording from the list to edit',
      group: 'Group',
      name: 'Name',
      operationCount: 'Operations',

      // Dialogs
      confirmClear: 'Confirm Clear',
      confirmClearMessage: 'Are you sure to clear all recorded operations? This cannot be undone.',
      confirmDelete: 'Confirm Delete',
      confirmDeleteMessage: 'Are you sure to delete recording "{name}"? This cannot be undone.',

      // Save dialog
      saveDialogTitle: 'Save Recording',
      groupPlaceholder: 'default',
      namePlaceholder: 'Recording_xxx',

      // Messages
      recordingStopped: 'Recording stopped, {count} operations',
      recordingStarted: 'Recording started',
      recordingCleared: 'Recording cleared',
      recordingSaved: 'Recording saved: {name}',
      recordingLoaded: 'Recording loaded: {name}',
      recordingDeleted: 'Recording deleted',
      playbackComplete: 'Playback complete',

      // Action types
      actionTypes: {
        tap: 'Tap',
        swipe: 'Swipe',
        input: 'Input',
        sleep: 'Sleep',
        command: 'Command',
        back: 'Back',
        home: 'Home',
      },
    },

    // Package panel
    package: {
      currentApp: 'Current App',
      packageName: 'Package',
      launchActivity: 'Launch Activity',
      version: 'Version',
      installTime: 'Install Time',
      actions: 'Actions',

      noAppSelected: 'No app selected',
      pleaseSelectApp: 'Please select an app from the list below',

      installedApps: 'Installed Apps',
      noApps: 'No apps found',

      launch: 'Launch',
      stop: 'Stop',
      clear: 'Clear Data',
      uninstall: 'Uninstall',

      confirmUninstall: 'Confirm Uninstall',
      confirmUninstallMessage: 'Are you sure to uninstall app "{name}"?',
      confirmClearData: 'Confirm Clear',
      confirmClearDataMessage: 'Are you sure to clear data of app "{name}"?',

      appLaunched: 'App launched',
      appStopped: 'App stopped',
      dataCleared: 'Data cleared',
      appUninstalled: 'App uninstalled',
    },
  },
}

/**
 * 国际化Store
 */
export const useI18nStore = defineStore('i18n', () => {
  const locale = ref<'zh' | 'en'>(
    (localStorage.getItem('language') as 'zh' | 'en') || 'zh'
  )

  const t = computed(() => messages[locale.value])

  function setLocale(lang: 'zh' | 'en') {
    locale.value = lang
    localStorage.setItem('language', lang)
  }

  // 格式化消息（支持占位符）
  function format(message: string, params?: Record<string, any>): string {
    if (!params) return message

    return message.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match
    })
  }

  return {
    locale,
    t,
    setLocale,
    format,
  }
})
