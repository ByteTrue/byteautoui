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

    // 首页
    home: {
      title: 'ByteAutoUI',
      subtitle: '移动端 UI 自动化检查工具',
      instruction: '请先连接设备，然后点击下方按钮选择设备',
      selectDevice: '选择设备',
      features: {
        multiPlatform: '支持 Android、iOS、HarmonyOS 设备',
        recording: '录制和回放操作序列',
        hierarchy: '实时查看 UI 层级结构',
      },
    },

    // iOS WDA 配置对话框
    iosConfig: {
      title: 'iOS WDA 配置',
      wdaStartFailed: 'WDA 启动失败',
      firstTimeSetup: '首次使用需要配置',
      setupDescription: '使用 ByteAutoUI 之前，必须先在 iOS 设备上安装 WebDriverAgent (WDA)。',
      setupGuide: '安装指南：',
      deviceUDID: '设备 UDID',
      wdaBundleId: 'WDA Bundle ID',
      wdaPort: 'WDA 端口',
      commonBundleIds: '常用 Bundle ID：',
      defaultBundleId: '（默认）',
      appiumBundleId: '（Appium）',
      helpTitle: '📖 如何查找你的 Bundle ID：',
      helpSteps: {
        step1: '在 Xcode 中打开 WebDriverAgent 项目',
        step2: '选择 "WebDriverAgentRunner" 目标',
        step3: '在 General 选项卡中查看 "Bundle Identifier"',
      },
      helpNote: '注意：配置将被保存并记住此设备。',
      cancel: '取消',
      saveConfiguration: '保存配置',
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
        label: '标签 (label)',
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

      // 断言
      assert: '断言',
      elementAssertion: '元素断言',
      screenshotAssertion: '截图断言',
      combinedAssertion: '组合断言',

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

      // 编辑操作对话框
      editAction: '编辑操作',
      actionType: '操作类型',
      waitTime: '等待时间',
      waitAfter: '完成后等待',
      milliseconds: '毫秒',
      seconds: '秒',

      // 坐标相关
      coordinates: '坐标',
      coordinateX: 'X坐标',
      coordinateY: 'Y坐标',
      startPosition: '起始位置',
      endPosition: '结束位置',

      // XPath
      xpathSelector: 'XPath选择器',
      xpathPlaceholder: '可选，留空则使用坐标模式',

      // 操作参数
      inputText: '输入文本',
      swipeDuration: '滑动时长',
      sleepDuration: '等待时长',
      command: '命令',

      // 回放状态
      selectRecording: '请选择录制',
      idle: '待机',
      playing: '播放中',
      paused: '已暂停',
      stopped: '已停止',
      error: '错误',

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
        assert: '断言',
      },

      // 失败控制
      failureControl: {
        title: '失败控制',
        globalSwitch: '全局覆盖',
        onExecute: '执行失败',
        onAssert: '断言失败',
        continue: '跳过',
        stop: '停止',
        behaviors: {
          continue: '跳过',
          stop: '停止'
        }
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

    // Home page
    home: {
      title: 'ByteAutoUI',
      subtitle: 'Mobile UI Automation Inspector',
      instruction: 'Connect your device and click the button below to select a device',
      selectDevice: 'Select Device',
      features: {
        multiPlatform: 'Supports Android, iOS, and HarmonyOS devices',
        recording: 'Record and playback operation sequences',
        hierarchy: 'Real-time UI hierarchy inspection',
      },
    },

    // iOS WDA Config Dialog
    iosConfig: {
      title: 'iOS WDA Configuration',
      wdaStartFailed: 'WDA Start Failed',
      firstTimeSetup: 'First time setup required',
      setupDescription: 'WebDriverAgent (WDA) must be installed on your iOS device before using ByteAutoUI.',
      setupGuide: 'Setup guide:',
      deviceUDID: 'Device UDID',
      wdaBundleId: 'WDA Bundle ID',
      wdaPort: 'WDA Port',
      commonBundleIds: 'Common Bundle IDs:',
      defaultBundleId: '(Default)',
      appiumBundleId: '(Appium)',
      helpTitle: '📖 How to find your Bundle ID:',
      helpSteps: {
        step1: 'Open WebDriverAgent project in Xcode',
        step2: 'Select "WebDriverAgentRunner" target',
        step3: 'Check "Bundle Identifier" in General tab',
      },
      helpNote: 'Note: Configuration will be saved and remembered for this device.',
      cancel: 'Cancel',
      saveConfiguration: 'Save Configuration',
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
        label: 'Label',
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

      // Assertions
      assert: 'Assert',
      elementAssertion: 'Element Assertion',
      screenshotAssertion: 'Screenshot Assertion',
      combinedAssertion: 'Combined Assertion',

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

      // Edit action dialog
      editAction: 'Edit Action',
      actionType: 'Action Type',
      waitTime: 'Wait Time',
      waitAfter: 'Wait After',
      milliseconds: 'ms',
      seconds: 's',

      // Coordinates
      coordinates: 'Coordinates',
      coordinateX: 'X Coordinate',
      coordinateY: 'Y Coordinate',
      startPosition: 'Start Position',
      endPosition: 'End Position',

      // XPath
      xpathSelector: 'XPath Selector',
      xpathPlaceholder: 'Optional, use coordinates if empty',

      // Action params
      inputText: 'Input Text',
      swipeDuration: 'Swipe Duration',
      sleepDuration: 'Sleep Duration',
      command: 'Command',

      // Playback states
      selectRecording: 'Select Recording',
      idle: 'Idle',
      playing: 'Playing',
      paused: 'Paused',
      stopped: 'Stopped',
      error: 'Error',

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
        assert: 'Assert',
      },

      // Failure Control
      failureControl: {
        title: 'Failure Control',
        globalSwitch: 'Global Override',
        onExecute: 'Execute Failure',
        onAssert: 'Assert Failure',
        continue: 'Continue',
        stop: 'Stop',
        behaviors: {
          continue: 'Continue',
          stop: 'Stop'
        }
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
