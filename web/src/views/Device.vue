<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, h } from 'vue'
import { useRouter } from 'vue-router'
import {
  NSpace,
  NButton,
  NButtonGroup,
  NIcon,
  NSpin,
  NEmpty,
  NRadioGroup,
  NRadioButton,
  NTooltip,
  NInput,
  NSelect,
  useMessage,
} from 'naive-ui'
import {
  ArrowBackOutline,
  ArrowForwardOutline,
  ArrowUpOutline,
  ArrowDownOutline,
  RefreshOutline,
  CopyOutline,
  VolumeHighOutline,
  VolumeLowOutline,
  VolumeMuteOutline,
  LogoAndroid,
  LogoApple,
  SunnyOutline,
  HomeOutline,
  AppsOutline,
  PowerOutline,
  StopCircleOutline,
  SendOutline,
  TrashOutline,
  RadioButtonOnOutline,
  MoonOutline,
} from '@vicons/ionicons5'
import { useDeviceStore } from '@/stores/device'
import { useThemeStore } from '@/stores/theme'
import { useI18nStore } from '@/stores/i18n'
import type { Platform, UINode } from '@/api/types'
import type { ElementCondition, ImageCondition, AssertParams } from '@/types/recording'
import { sendCommand, tap, setIOSConfig } from '@/api'
import ScreenPanel from '@/components/ScreenPanel.vue'
import HierarchyPanel from '@/components/panels/HierarchyPanel.vue'
import ActionsPanel from '@/components/panels/ActionsPanel.vue'
import PackagePanel from '@/components/panels/PackagePanel.vue'
import DeviceSelector from '@/components/DeviceSelector.vue'
import IOSConfigDialog from '@/components/dialogs/IOSConfigDialog.vue'
import ElementSelectorDialog from '@/components/dialogs/ElementSelectorDialog.vue'
import ImageSelectorDialog from '@/components/dialogs/ImageSelectorDialog.vue'
import AssertConfigDialog from '@/components/dialogs/AssertConfigDialog.vue'
import type { ScreenMode } from '@/composables/useDrawingCanvas'
import { MAX_TEMPLATE_SIZE } from '@/constants/assertion'

const props = defineProps<{
  platform: Platform
  serial: string
}>()

const router = useRouter()
const message = useMessage()
const store = useDeviceStore()
const themeStore = useThemeStore()
const i18nStore = useI18nStore()

// ActionsPanel引用
const actionsPanelRef = ref<InstanceType<typeof ActionsPanel> | null>(null)

// 断言对话框引用
const elementSelectorDialogRef = ref<InstanceType<typeof ElementSelectorDialog> | null>(null)
const imageSelectorDialogRef = ref<InstanceType<typeof ImageSelectorDialog> | null>(null)
const assertConfigDialogRef = ref<InstanceType<typeof AssertConfigDialog> | null>(null)

// 断言模式状态
const assertMode = ref<'element' | 'screenshot' | null>(null)

// 计算当前屏幕模式（用于传递给 ScreenPanel）
const computedScreenMode = computed<ScreenMode | undefined>(() => {
  if (assertMode.value === 'element') return 'assert-element'
  if (assertMode.value === 'screenshot') return 'assert-screenshot'
  return undefined
})

const activeTab = ref('hierarchy')
const showDeviceSelector = ref(false)

// iOS WDA配置对话框
const showIOSConfigDialog = ref(false)
const iosConfigError = ref<string | undefined>(undefined)

// 国际化文本
const t = computed(() => i18nStore.t.device)

// Current Activity
const currentActivity = ref('')

// Resizable screen panel
const screenPanelWidth = ref(450)
const isResizing = ref(false)

// Handle resize
function startResize(e: MouseEvent) {
  isResizing.value = true
  e.preventDefault()
}

function handleResize(e: MouseEvent) {
  if (!isResizing.value) return

  const newWidth = e.clientX
  if (newWidth >= 300 && newWidth <= 800) {
    screenPanelWidth.value = newWidth
    localStorage.setItem('screenPanelWidth', newWidth.toString())
  }
}

function stopResize() {
  isResizing.value = false
}

// Remote Mode - REMOVED: 后端没有 /remote WebSocket endpoint，此功能不存在
// 实时控制功能已集成到 ScreenPanel 组件：指针模式自动启用视频流

// Scrcpy Mode - 自动模式切换已实现：
// - 查看模式 (default): 静态截图
// - 指针模式 (pointer): 自动启用 Scrcpy 视频流（实时反馈）
// - 取色模式 (crosshair): 静态截图

// Generic command handler to eliminate code duplication
async function executeCommand(
  command: string,
  params: Record<string, any> = {},
  successMsg: string,
  errorPrefix: string
) {
  try {
    await sendCommand(props.platform, props.serial, command, params)
    message.success(successMsg)
  } catch (error) {
    message.error(`${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Volume control
const volumeUp = () => executeCommand('volumeUp', {}, 'Volume up', 'Volume control failed')
const volumeDown = () => executeCommand('volumeDown', {}, 'Volume down', 'Volume control failed')
const volumeMute = () => executeCommand('volumeMute', {}, 'Volume muted', 'Volume control failed')

// P1 Advanced Functions
const inputText = ref('')

// XPath selector (Android 默认 id；iOS 默认 class_and_label)
const xpathSelector = ref(props.platform === 'ios' ? 'class_and_label' : 'id')

watch(
  () => props.platform,
  (platform) => {
    const validSelectors = platform === 'ios'
      ? new Set(['label', 'class', 'class_and_label'])
      : new Set(['id', 'text', 'class', 'class_and_text'])

    if (!validSelectors.has(xpathSelector.value)) {
      xpathSelector.value = platform === 'ios' ? 'class_and_label' : 'id'
    }
  },
  { immediate: true }
)

// Generate XPath based on selector type
const generateXPath = (type: string, node: UINode | null): string => {
  if (!node) return ''

  switch (type) {
    case 'id':
      return node.resource_id ? `//*[@resource-id="${node.resource_id}"]` : ''
    case 'content-desc':
      return node.content_desc ? `//*[@content-desc="${node.content_desc}"]` : ''
    case 'text':
      return node.text ? `//*[@text="${node.text}"]` : ''
    case 'label':
      return node.label ? `//*[@label="${node.label}"]` : ''
    case 'class_and_text':
      return node.class_name && node.text
        ? `//${node.class_name}[@text="${node.text}"]`
        : ''
    case 'class_and_label':
      return node.class_name && node.label
        ? `//${node.class_name}[@label="${node.label}"]`
        : ''
    case 'class':
      return node.class_name ? `//${node.class_name}` : ''
    default:
      return node.xpath || ''
  }
}

// XPath selector options with previews and counts
const xpathSelectorOptions = computed(() => {
  const node = selectedNode.value
  if (!node) return []

  // Helper to count matching nodes for a given XPath type
  const countMatches = (type: string, xpath: string): number => {
    if (!xpath || !store.hierarchy?.nodes) return 0
    let count = 0

    function traverse(nodes: UINode[]) {
      nodes.forEach(n => {
        const nodeXPath = generateXPath(type, n)
        if (nodeXPath === xpath) count++
        if (n.children) traverse(n.children)
      })
    }

    traverse(store.hierarchy.nodes)
    return count
  }

  // 按精确度排序：Android(id > class_and_text > class > text) / iOS(class_and_label > label > class)
  const options = props.platform === 'ios'
    ? [
      {
        label: 'class_and_label',
        value: 'class_and_label',
        xpath: generateXPath('class_and_label', node),
      },
      {
        label: 'label',
        value: 'label',
        xpath: generateXPath('label', node),
      },
      {
        label: 'class',
        value: 'class',
        xpath: generateXPath('class', node),
      },
    ]
    : [
      {
        label: 'id',
        value: 'id',
        xpath: generateXPath('id', node),
      },
      {
        label: 'class_and_text',
        value: 'class_and_text',
        xpath: generateXPath('class_and_text', node),
      },
      {
        label: 'class',
        value: 'class',
        xpath: generateXPath('class', node),
      },
      {
        label: 'text',
        value: 'text',
        xpath: generateXPath('text', node),
      },
    ]

  // Add count for each option
  return options.map(opt => ({
    ...opt,
    count: opt.xpath ? countMatches(opt.value, opt.xpath) : 0,
  }))
})

// Current XPath based on selector
const currentXPath = computed(() => generateXPath(xpathSelector.value, selectedNode.value))

// Same class siblings navigation
const sameClassSiblings = ref<UINode[]>([])
const currentSiblingIndex = ref(-1)

// Find all siblings with same class (same parent only)
// Show navigation based on current XPath selector type
function findSameClassSiblings(node: UINode | null) {
  sameClassSiblings.value = []
  currentSiblingIndex.value = -1

  if (!node || !store.hierarchy?.nodes) return

  // Get current XPath pattern based on selector type
  const currentXPath = generateXPath(xpathSelector.value, node)
  if (!currentXPath) return

  // Find all nodes matching the current XPath pattern
  const allNodes: UINode[] = []

  function flatten(nodes: UINode[]) {
    nodes.forEach(n => {
      const nodeXPath = generateXPath(xpathSelector.value, n)
      if (nodeXPath === currentXPath) {
        allNodes.push(n)
      }
      if (n.children) flatten(n.children)
    })
  }

  flatten(store.hierarchy.nodes)

  // Only show navigation if there are multiple matches
  if (allNodes.length > 1) {
    sameClassSiblings.value = allNodes
    currentSiblingIndex.value = allNodes.findIndex(n => n.key === node.key)
  }
}

// Select sibling by index
function selectSibling(index: number) {
  if (index >= 0 && index < sameClassSiblings.value.length) {
    store.selectNode(sameClassSiblings.value[index]!)
  }
}

// Render XPath tag (收起状态 - 只显示类型名)
function renderXPathTag({ option }: { option: any }) {
  return option.label
}

// Render XPath option with preview and count (展开列表 - 两列布局)
function renderXPathOption(option: any) {
  return h(
    'div',
    { class: 'xpath-option' },
    [
      // 左侧：类型名称
      h('span', { class: 'xpath-option-label' }, option.label),
      // 右侧：xpath路径 + 计数
      h('div', { class: 'xpath-option-right' }, [
        option.xpath
          ? h('span', { class: 'xpath-option-preview' }, option.xpath)
          : null,
        option.count > 0
          ? h('span', { class: 'xpath-option-count' }, option.count.toString())
          : null,
      ].filter(Boolean))
    ]
  )
}

async function sendKeys() {
  if (!inputText.value.trim()) {
    message.warning('Please enter text')
    return
  }

  try {
    await sendCommand(props.platform, props.serial, 'sendKeys', { text: inputText.value })
    message.success(`Sent: ${inputText.value}`)
    inputText.value = ''
  } catch (error) {
    message.error(`Send text failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function clearText() {
  try {
    await sendCommand(props.platform, props.serial, 'clearText', {})
    message.success('Text cleared')
  } catch (error) {
    message.error(`Clear text failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// P0 Basic Functions
const goHome = () => executeCommand('home', {}, 'Home', 'Home failed')
const pressBack = () => executeCommand('back', {}, 'Back', 'Back failed')
const appSwitch = () => executeCommand('appSwitch', {}, 'App Switch', 'App Switch failed')
const wakeUp = () => executeCommand('wakeUp', {}, 'Wake Up', 'Wake Up failed')
const terminate = () => executeCommand('terminate', {}, 'Terminated current app', 'Terminate failed')

// Platform icon
const platformIcon = computed(() => {
  switch (props.platform) {
    case 'android': return LogoAndroid
    case 'ios': return LogoApple
    case 'harmony': return SunnyOutline
    default: return LogoAndroid
  }
})

// Screen size - ensure valid numbers
const screenSize = computed(() => {
  const size = store.screenSize
  return {
    width: size?.width || 0,
    height: size?.height || 0,
  }
})
const selectedNode = computed(() => store.selectedNode)

// Watch selected node and xpath selector changes to update same class siblings
watch(
  () => [selectedNode.value, xpathSelector.value] as const,
  ([node]) => {
    findSameClassSiblings(node)
  },
  { immediate: true }
)

// 从 UINode 反向构造原始的后端属性格式
function getRawProperties(node: UINode): Record<string, string> {
  const raw: Record<string, string> = {}

  // 按照原版格式构造
  if (node.index !== undefined) raw.index = String(node.index)
  if (node.text) raw.text = node.text
  if (node.label) raw.label = node.label
  if (node.resource_id) raw['resource-id'] = node.resource_id
  if (node.class_name) raw.class = node.class_name
  if (node.package) raw.package = node.package
  if (node.content_desc) raw['content-desc'] = node.content_desc
  if (node.checkable !== undefined) raw.checkable = String(node.checkable)
  if (node.checked !== undefined) raw.checked = String(node.checked)
  if (node.clickable !== undefined) raw.clickable = String(node.clickable)
  if (node.enabled !== undefined) raw.enabled = String(node.enabled)
  if (node.focusable !== undefined) raw.focusable = String(node.focusable)
  if (node.focused !== undefined) raw.focused = String(node.focused)
  if (node.scrollable !== undefined) raw.scrollable = String(node.scrollable)
  if (node.long_clickable !== undefined) raw['long-clickable'] = String(node.long_clickable)
  if (node.password !== undefined) raw.password = String(node.password)
  if (node.selected !== undefined) raw.selected = String(node.selected)
  if (node.visible_to_user !== undefined) raw['visible-to-user'] = String(node.visible_to_user)

  // bounds 格式：[x1,y1][x2,y2]
  if (node.bounds) {
    const [x1, y1, x2, y2] = node.bounds
    raw.bounds = `[${x1},${y1}][${x2},${y2}]`
  }

  return raw
}

// Property details data (for Hierarchy tab middle panel - two column format)
interface PropertyDetail {
  label: string
  value: string | number | boolean
  icon?: string
}

const propertyDetails = computed<PropertyDetail[]>(() => {
  if (!selectedNode.value) return []

  const node = selectedNode.value
  const details: PropertyDetail[] = []

  // 基础属性
  if (node.index !== undefined) details.push({ label: 'index', value: node.index })
  if (node.text) details.push({ label: 'text', value: node.text })
  if (node.label) details.push({ label: 'label', value: node.label })
  if (node.resource_id) details.push({ label: 'resource-id', value: node.resource_id })
  if (node.class_name) details.push({ label: 'class', value: node.class_name })
  if (node.package) details.push({ label: 'package', value: node.package })
  if (node.content_desc) details.push({ label: 'content-desc', value: node.content_desc })

  // 布尔属性
  if (node.checkable !== undefined) details.push({ label: 'checkable', value: node.checkable })
  if (node.checked !== undefined) details.push({ label: 'checked', value: node.checked })
  if (node.clickable !== undefined) details.push({ label: 'clickable', value: node.clickable })
  if (node.enabled !== undefined) details.push({ label: 'enabled', value: node.enabled })
  if (node.focusable !== undefined) details.push({ label: 'focusable', value: node.focusable })
  if (node.focused !== undefined) details.push({ label: 'focused', value: node.focused })
  if (node.scrollable !== undefined) details.push({ label: 'scrollable', value: node.scrollable })
  if (node.long_clickable !== undefined) details.push({ label: 'long-clickable', value: node.long_clickable })
  if (node.password !== undefined) details.push({ label: 'password', value: node.password })
  if (node.selected !== undefined) details.push({ label: 'selected', value: node.selected })
  if (node.visible_to_user !== undefined) details.push({ label: 'visible-to-user', value: node.visible_to_user })

  // 位置和尺寸信息
  if (node.bounds) {
    const [x1, y1, x2, y2] = node.bounds
    details.push({ label: 'bounds', value: `[${x1},${y1}][${x2},${y2}]` })
  }

  if (node.rect) {
    details.push({ label: 'rect.x', value: node.rect.x })
    details.push({ label: 'rect.y', value: node.rect.y })
    details.push({ label: 'rect.width', value: node.rect.width })
    details.push({ label: 'rect.height', value: node.rect.height })
  }

  // XPath (最后显示，因为可能很长)
  if (node.xpath) details.push({ label: 'xpath', value: node.xpath })

  // Raw 原始属性 (JSON 格式，放在最后)
  details.push({ label: 'raw', value: JSON.stringify(getRawProperties(node), null, 2) })

  return details
})

// 将 bounds 转换为像素坐标（后端可能返回归一化坐标 0-1）
function toAbsoluteBounds(bounds: [number, number, number, number]) {
  const { width, height } = screenSize.value
  const [x1, y1, x2, y2] = bounds
  const looksNormalized = x2 <= 1 && y2 <= 1

  if (looksNormalized) {
    if (!width || !height) {
      throw new Error('无法计算元素坐标：屏幕尺寸未知')
    }
    return [
      Math.round(x1 * width),
      Math.round(y1 * height),
      Math.round(x2 * width),
      Math.round(y2 * height),
    ] as [number, number, number, number]
  }

  return bounds
}

// Handle ScreenPanel tap event
function handleTap(_x: number, _y: number) {
  // Note: ScreenPanel already handles sending tap to device in pointer mode
  // Action recording is now handled by ActionsPanel component
}

// Handle recording tap event
async function handleRecordTap(x: number, y: number, selectedNode: UINode | null) {
  if (actionsPanelRef.value) {
    try {
      await actionsPanelRef.value.recordTap(x, y, selectedNode)
    } catch (error) {
      message.error(`录制点击失败: ${error instanceof Error ? error.message : String(error)}`)
      console.error('Failed to record tap:', error)
    }
  }
}

// Handle recording swipe event
async function handleRecordSwipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  duration: number,
  selectedNode: UINode | null
) {
  if (actionsPanelRef.value) {
    try {
      await actionsPanelRef.value.recordSwipe(startX, startY, endX, endY, duration, selectedNode)
    } catch (error) {
      message.error(`录制滑动失败: ${error instanceof Error ? error.message : String(error)}`)
      console.error('Failed to record swipe:', error)
    }
  }
}

// 断言菜单选择处理
function handleAssertMenuSelect(key: string) {
  if (key === 'element') {
    // 进入元素选择模式
    assertMode.value = 'element'
    message.info('请点击屏幕上的元素')
  } else if (key === 'screenshot') {
    // 进入截图框选模式
    assertMode.value = 'screenshot'
    message.info('请在屏幕上拖拽框选区域')
  } else if (key === 'combined') {
    // 直接打开组合断言配置对话框
    assertConfigDialogRef.value?.show()
  }
}

// 元素选择完成
function handleElementSelected(node: UINode) {
  // 提取 XPath（优先使用 node.xpath，降级为属性生成）
  const xpath = node.xpath || generateXPath('id', node) || `//*[@class="${node.class_name}"]`

  // 提取属性
  const attributes: { text?: string; resourceId?: string; className?: string } = {}
  if (node.text) attributes.text = node.text
  if (node.resource_id) attributes.resourceId = node.resource_id
  if (node.class_name) attributes.className = node.class_name

  // 打开 ElementSelectorDialog 并预填充
  elementSelectorDialogRef.value?.show()
  elementSelectorDialogRef.value?.prefill({ xpath, attributes })

  // 退出选择模式
  assertMode.value = null
}

// 截图裁剪完成
function handleScreenshotCropped(base64: string) {
  // 检查大小限制 - 需要先去除 data URI 前缀再计算
  const base64Data = base64.includes(',') ? base64.split(',')[1]! : base64
  const sizeBytes = Math.ceil((base64Data.length * 3) / 4)  // Base64 解码后大小估算
  if (sizeBytes > MAX_TEMPLATE_SIZE) {
    message.error(`裁剪区域过大 (${(sizeBytes / 1024).toFixed(1)}KB)，请选择更小的区域`)
    // 不退出模式，让用户可以重新选择
    return
  }

  // 打开 ImageSelectorDialog 并预填充
  imageSelectorDialogRef.value?.show()
  imageSelectorDialogRef.value?.setTemplateData(base64)

  // 退出框选模式
  assertMode.value = null
}

// 元素条件确认
function handleElementConditionConfirm(condition: ElementCondition) {
  // 添加到 AssertConfigDialog
  assertConfigDialogRef.value?.addCondition(condition)
  assertConfigDialogRef.value?.show()
}

// 图片条件确认
function handleImageConditionConfirm(condition: ImageCondition) {
  // 添加到 AssertConfigDialog
  assertConfigDialogRef.value?.addCondition(condition)
  assertConfigDialogRef.value?.show()
}

// 断言参数确认
function handleAssertParamsConfirm(params: AssertParams) {
  // 录制断言动作
  actionsPanelRef.value?.recordAssert(params)
  message.success('断言已添加')
}

// 编辑断言（打开AssertConfigDialog）
function handleEditAssert(action: RecordedAction) {
  assertConfigDialogRef.value?.edit(action)
}

// 断言更新确认（编辑模式）
function handleAssertParamsUpdate(id: string, params: AssertParams) {
  // 使用recorder.updateAction更新断言
  const recorder = actionsPanelRef.value?.recorder
  if (recorder) {
    const success = recorder.updateAction(id, { params })
    if (success) {
      message.success('断言已更新')
    } else {
      message.error('更新失败：断言不存在')
    }
  }
}

// 从 AssertConfigDialog 中添加元素断言
function handleAddElementFromDialog() {
  // 先隐藏对话框，让用户可以选择元素
  assertConfigDialogRef.value?.hide()
  assertMode.value = 'element'
  message.info('请点击屏幕上的元素')
}

// 从 AssertConfigDialog 中添加图片断言
function handleAddImageFromDialog() {
  // 先隐藏对话框，让用户可以框选区域
  assertConfigDialogRef.value?.hide()
  assertMode.value = 'screenshot'
  message.info('请在屏幕上拖拽框选区域')
}

// Element action functions (for view mode)
async function tapElement() {
  if (!selectedNode.value || !selectedNode.value.bounds) {
    message.warning('请先选择一个元素')
    return
  }

  try {
    const xpath = currentXPath.value || selectedNode.value.xpath

    if (xpath) {
      await sendCommand(props.platform, props.serial, 'clickElement', {
        by: 'xpath',
        value: xpath,
      })
      message.success('已通过 XPath 点击元素')
    } else {
      // 无 XPath 时回退到坐标点击
      const bounds = toAbsoluteBounds(selectedNode.value.bounds)
      const [x1, y1, x2, y2] = bounds
      const centerX = Math.round((x1 + x2) / 2)
      const centerY = Math.round((y1 + y2) / 2)
      await tap(props.platform, props.serial, centerX, centerY)
      message.success(`点击元素: (${centerX}, ${centerY})`)
    }

    // 如果正在录制，记录操作
    if (actionsPanelRef.value?.getIsRecording?.()) {
      // 录制使用坐标，录制器会同时写入 XPath 作为定位信息
      const bounds = toAbsoluteBounds(selectedNode.value.bounds)
      const [x1, y1, x2, y2] = bounds
      const centerX = Math.round((x1 + x2) / 2)
      const centerY = Math.round((y1 + y2) / 2)
      await actionsPanelRef.value.recordTap(centerX, centerY, selectedNode.value)
      message.info('已录制点击操作（含 XPath）')
    }
  } catch (error) {
    message.error(`点击失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Refresh hierarchy
async function refresh() {
  await store.refreshHierarchy()

  // 检查store.error - iOS WDA启动失败时显示配置对话框
  if (store.error && props.platform === 'ios') {
    const errorMsg = store.error
    // 检查是否是WDA相关错误
    if (errorMsg.includes('InvalidService') || errorMsg.includes('WDA') || errorMsg.includes('WebDriverAgent')) {
      iosConfigError.value = errorMsg
      showIOSConfigDialog.value = true
      return
    }
  }

  // Also refresh current activity
  try {
    const result = await sendCommand(props.platform, props.serial, 'currentApp', {})
    if (result && typeof result === 'object' && 'package' in result) {
      currentActivity.value = (result as { package: string }).package || ''
    }
  } catch (error) {
    // Ignore error, activity display is optional
  }
}

// 处理iOS配置保存
async function handleIOSConfigConfirm(bundleId: string, port: number) {
  try {
    await setIOSConfig(props.serial, {
      wda_bundle_id: bundleId,
      wda_port: port
    })
    message.success('配置已保存')
    // 关闭对话框
    showIOSConfigDialog.value = false
    iosConfigError.value = undefined
    // 重新尝试刷新
    await refresh()
  } catch (error) {
    message.error(`保存配置失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Copy serial
function copySerial() {
  navigator.clipboard.writeText(props.serial)
  message.success('Copied')
}

// Switch device
function handleDeviceSelect(platform: Platform, serial: string) {
  router.push(`/${platform}/${serial}`)
}

// Copy current selected XPath format
function copyXPath() {
  const xpath = currentXPath.value
  if (!xpath) {
    message.warning('No XPath available')
    return
  }
  navigator.clipboard.writeText(xpath)
  message.success('XPath copied')
}

// Handle keyboard shortcuts
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'r' || e.key === 'R') {
    if (!e.ctrlKey && !e.metaKey) {  // 避免冲突Ctrl+R
      e.preventDefault()
      refresh()
    }
  }
}

// Initialize
onMounted(() => {
  // Initialize screen panel width from localStorage
  const savedWidth = localStorage.getItem('screenPanelWidth')
  if (savedWidth) {
    screenPanelWidth.value = parseInt(savedWidth, 10)
  }

  // Add resize listeners
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)

  store.setDevice(props.platform, props.serial)
  refresh()

  // 键盘事件监听
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('keydown', handleKeyDown)
})

// Watch route params
watch(
  () => [props.platform, props.serial],
  () => {
    store.setDevice(props.platform, props.serial)
    refresh()
  }
)

// Swipe gestures
const swipeUp = () => executeCommand('swipeUp', {}, 'Swiped up', 'Swipe failed')
const swipeDown = () => executeCommand('swipeDown', {}, 'Swiped down', 'Swipe failed')
const swipeLeft = () => executeCommand('swipeLeft', {}, 'Swiped left', 'Swipe failed')
const swipeRight = () => executeCommand('swipeRight', {}, 'Swiped right', 'Swipe failed')

// Remote Mode 相关函数已删除 - 后端不支持此功能
// 如需实时视频流，请使用 Scrcpy Mode
</script>

<template>
  <div class="device-page">
    <!-- Header -->
    <header class="page-header">
      <n-space align="center" :size="12">
        <n-button secondary size="small" @click="showDeviceSelector = true">
          <template #icon>
            <n-icon><apps-outline /></n-icon>
          </template>
          {{ t.selectDevice }}
        </n-button>
        <n-icon size="20" color="#18a058">
          <component :is="platformIcon" />
        </n-icon>
        <span class="serial">{{ serial }}</span>
        <n-button text size="small" @click="copySerial">
          <template #icon>
            <n-icon size="14"><copy-outline /></n-icon>
          </template>
        </n-button>

        <n-button-group size="small">
          <n-button
            :type="activeTab === 'hierarchy' ? 'primary' : 'default'"
            :secondary="activeTab !== 'hierarchy'"
            @click="activeTab = 'hierarchy'"
          >
            {{ t.hierarchy }}
          </n-button>
          <n-button
            :type="activeTab === 'actions' ? 'primary' : 'default'"
            :secondary="activeTab !== 'actions'"
            @click="activeTab = 'actions'"
          >
            {{ t.actions }}
          </n-button>
          <n-button
            :type="activeTab === 'package' ? 'primary' : 'default'"
            :secondary="activeTab !== 'package'"
            @click="activeTab = 'package'"
          >
            {{ t.package }}
          </n-button>
        </n-button-group>
      </n-space>

      <n-space align="center" :size="16">
        <n-tooltip placement="bottom">
          <template #trigger>
            <n-button quaternary circle @click="refresh" :loading="store.loading">
              <template #icon>
                <n-icon size="20"><refresh-outline /></n-icon>
              </template>
            </n-button>
          </template>
          {{ t.refresh }}
        </n-tooltip>
        <n-button quaternary circle @click="themeStore.toggleTheme">
          <template #icon>
            <n-icon size="20">
              <component :is="themeStore.isDark ? SunnyOutline : MoonOutline" />
            </n-icon>
          </template>
        </n-button>
        <n-radio-group v-model:value="i18nStore.locale" size="small">
          <n-radio-button value="zh">中文</n-radio-button>
          <n-radio-button value="en">English</n-radio-button>
        </n-radio-group>
      </n-space>
    </header>

    <!-- Main Content Area - Dynamic Layout Based on Active Tab -->
    <div class="main-area">
      <!-- Left Panel: Screenshot + Controls (always visible) -->
      <div class="screen-panel" :style="{ width: screenPanelWidth + 'px' }">
        <!-- Vertical Control Sidebar -->
        <div class="control-sidebar">
          <!-- Basic Controls -->
          <div class="control-group">
            <n-tooltip placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" @click="goHome">
                  <template #icon>
                    <n-icon size="18"><home-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.home }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" @click="pressBack">
                  <template #icon>
                    <n-icon size="18"><arrow-back-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.back }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" @click="appSwitch">
                  <template #icon>
                    <n-icon size="18"><apps-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.apps }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" @click="wakeUp">
                  <template #icon>
                    <n-icon size="18"><power-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.wake }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" @click="terminate">
                  <template #icon>
                    <n-icon size="18"><stop-circle-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.stop }}
            </n-tooltip>
          </div>

          <!-- Volume Controls -->
          <div class="control-group">
            <n-tooltip placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" @click="volumeDown">
                  <template #icon>
                    <n-icon size="18"><volume-low-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.volumeDown }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" @click="volumeMute">
                  <template #icon>
                    <n-icon size="18"><volume-mute-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.volumeMute }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button quaternary circle size="small" @click="volumeUp">
                  <template #icon>
                    <n-icon size="18"><volume-high-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.volumeUp }}
            </n-tooltip>
          </div>

          <!-- Swipe Controls -->
          <div class="control-group">
            <n-tooltip placement="right">
              <template #trigger>
                <n-button circle size="small" @click="swipeUp">
                  <template #icon>
                    <n-icon size="18"><arrow-up-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.swipeUp }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button circle size="small" @click="swipeDown">
                  <template #icon>
                    <n-icon size="18"><arrow-down-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.swipeDown }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button circle size="small" @click="swipeLeft">
                  <template #icon>
                    <n-icon size="18"><arrow-back-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.swipeLeft }}
            </n-tooltip>
            <n-tooltip placement="right">
              <template #trigger>
                <n-button circle size="small" @click="swipeRight">
                  <template #icon>
                    <n-icon size="18"><arrow-forward-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              {{ t.swipeRight }}
            </n-tooltip>
          </div>

          <!-- Element Actions (when element selected) -->
          <div v-if="selectedNode" class="control-group">
            <n-button type="primary" size="small" @click="tapElement" class="vertical-text-btn">
              <span class="vertical-text">{{ t.tapElement }}</span>
            </n-button>
          </div>
        </div>

        <!-- Screen Content Area -->
        <div class="screen-content">
          <!-- Text Input Controls -->
          <div class="text-input-bar">
            <n-input
              v-model:value="inputText"
              size="small"
              placeholder="Enter text to send..."
              @keydown.enter="sendKeys"
              style="flex: 1"
            />
            <n-tooltip>
              <template #trigger>
                <n-button type="primary" size="small" @click="sendKeys" :disabled="!inputText.trim()">
                  <template #icon>
                    <n-icon><send-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              Send
            </n-tooltip>
            <n-tooltip>
              <template #trigger>
                <n-button quaternary size="small" @click="clearText">
                  <template #icon>
                    <n-icon><trash-outline /></n-icon>
                  </template>
                </n-button>
              </template>
              Clear
            </n-tooltip>
          </div>

          <div class="screenshot-area">
            <n-spin :show="store.loading" style="width: 100%; height: 100%;">
              <ScreenPanel
                v-if="store.screenshotUrl"
                :platform="platform"
                :serial="serial"
                :screen-size="screenSize"
                :screen-mode="computedScreenMode"
                @tap="handleTap"
                @record-tap="handleRecordTap"
                @record-swipe="handleRecordSwipe"
                @element-selected="handleElementSelected"
                @screenshot-cropped="handleScreenshotCropped"
              />
            </n-spin>
          </div>
        </div>
      </div>

      <!-- Resize Handle -->
      <div class="resize-handle" @mousedown="startResize"></div>

      <!-- Middle Panel: Property Details (only visible in Hierarchy tab) -->
      <div v-if="activeTab === 'hierarchy'" class="property-details-panel">
        <!-- XPath Selector -->
        <div class="xpath-selector-bar">
          <span class="xpath-label">XPath by</span>
          <div class="xpath-select-wrapper">
            <n-select
              v-model:value="xpathSelector"
              :options="xpathSelectorOptions"
              :render-label="renderXPathOption"
              :render-tag="renderXPathTag"
              :consistent-menu-width="false"
              size="small"
            />
          </div>
          <n-button
            size="small"
            quaternary
            circle
            @click="copyXPath"
            :disabled="!currentXPath"
          >
            <template #icon>
              <n-icon><copy-outline /></n-icon>
            </template>
          </n-button>
        </div>

        <!-- XPath Display with Same Class Navigation -->
        <div v-if="currentXPath" class="xpath-display-bar">
          <div class="xpath-text">{{ currentXPath }}</div>

          <!-- Same Class Siblings Navigation -->
          <div v-if="sameClassSiblings.length > 1" class="siblings-nav">
            <n-button
              v-for="(_, index) in sameClassSiblings"
              :key="index"
              size="small"
              :type="index === currentSiblingIndex ? 'info' : 'default'"
              :secondary="index !== currentSiblingIndex"
              circle
              @click="selectSibling(index)"
              class="sibling-btn"
            >
              {{ index + 1 }}
            </n-button>
          </div>
        </div>

        <!-- Property Details Table (Two Column Format) -->
        <div class="property-details-table">
          <div
            v-for="detail in propertyDetails"
            :key="detail.label"
            class="property-row"
          >
            <div class="property-cell label-cell">{{ detail.label }}</div>
            <div class="property-cell value-cell">
              <n-icon class="circle-icon"><radio-button-on-outline /></n-icon>
              <span>{{ detail.value }}</span>
            </div>
          </div>
          <n-empty v-if="propertyDetails.length === 0" description="No element selected" />
        </div>
      </div>

      <!-- Right Panel: Content Area (changes based on active tab) -->
      <div class="right-panel">
        <!-- Hierarchy Tab: Tree View -->
        <HierarchyPanel v-if="activeTab === 'hierarchy'" :platform="platform" :serial="serial" />

        <!-- Actions Tab (always rendered, controlled by v-show for recording) -->
        <ActionsPanel
          v-show="activeTab === 'actions'"
          ref="actionsPanelRef"
          :platform="platform"
          :serial="serial"
          @assert-menu-select="handleAssertMenuSelect"
          @edit-assert="handleEditAssert"
        />

        <!-- Package Manager Tab -->
        <PackagePanel v-if="activeTab === 'package'" :platform="platform" :serial="serial" />
      </div>
    </div>

    <!-- Device Selector Modal -->
    <DeviceSelector
      v-model:show="showDeviceSelector"
      @select="handleDeviceSelect"
    />

    <!-- iOS WDA Config Dialog -->
    <IOSConfigDialog
      v-model:show="showIOSConfigDialog"
      :serial="serial"
      :error-message="iosConfigError"
      @confirm="handleIOSConfigConfirm"
    />

    <!-- 断言对话框 -->
    <ElementSelectorDialog
      ref="elementSelectorDialogRef"
      @confirm="handleElementConditionConfirm"
    />
    <ImageSelectorDialog
      ref="imageSelectorDialogRef"
      @confirm="handleImageConditionConfirm"
    />
    <AssertConfigDialog
      ref="assertConfigDialogRef"
      @confirm="handleAssertParamsConfirm"
      @update="handleAssertParamsUpdate"
      @add-element="handleAddElementFromDialog"
      @add-image="handleAddImageFromDialog"
    />
  </div>
</template>

<style scoped>
.device-page {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--md-background);
  overflow: hidden;
}

.page-header {
  height: var(--md-header-height);
  padding: 0 var(--md-space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--md-outline);
  background: var(--md-surface);
  flex-shrink: 0;
  box-shadow: var(--md-elevation-1);
}

.serial {
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
}

.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Left Panel: Screenshot + Controls (resizable) */
.screen-panel {
  min-width: 300px;
  max-width: 800px;
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  border-right: 1px solid var(--md-outline);
  overflow: hidden;
  background: var(--md-surface);
}

/* Resize Handle */
.resize-handle {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--md-outline);
  transition: background var(--md-duration-short) var(--md-easing-standard);
  position: relative;
}

.resize-handle:hover {
  background: var(--md-primary);
}

.resize-handle:active {
  background: var(--md-primary-active);
}

/* Middle Panel: Property Details (Hierarchy tab only) */
.property-details-panel {
  width: 380px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--md-outline);
  flex-shrink: 0;
  overflow: hidden;
  background: var(--md-surface);
}

/* XPath Selector Bar */
.xpath-selector-bar {
  height: 48px;
  padding: var(--md-space-sm) var(--md-space-md);
  display: flex;
  align-items: center;
  gap: var(--md-space-sm);
  border-bottom: 1px solid var(--md-outline);
  background: var(--md-surface-variant);
  flex-shrink: 0;
}

.xpath-label {
  font-size: var(--md-font-size-sm);
  color: var(--md-text-secondary);
  white-space: nowrap;
}

/* XPath Select Wrapper - Fixed Width Container */
.xpath-select-wrapper {
  flex: 1;
  max-width: 180px;
  min-width: 120px;
}

/* XPath Display Bar with Navigation */
.xpath-display-bar {
  padding: var(--md-space-md);
  border-bottom: 1px solid var(--md-outline);
  background: var(--md-surface);
  display: flex;
  flex-direction: column;
  gap: var(--md-space-sm);
}

.xpath-text {
  font-family: var(--md-font-family-mono);
  font-size: var(--md-font-size-xs);
  color: var(--md-primary);
  word-break: break-all;
  line-height: var(--md-line-height-relaxed);
}

/* Same Class Siblings Navigation */
.siblings-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.sibling-btn {
  min-width: 32px !important;
  padding: 0 8px !important;
  font-size: 12px;
}

/* XPath Select Option Styles - 参考图8布局 */
/* 注意：下拉菜单通过 Teleport 渲染到 body，样式在非 scoped 的 style 块中 */

/* Property Details Table (Two Column Format) */
.property-details-table {
  flex: 1;
  overflow: auto;
}

.property-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  border-bottom: 1px solid var(--md-outline-variant);
  transition: background var(--md-duration-short) var(--md-easing-standard);
}

.property-row:hover {
  background: var(--md-surface-variant);
}

.property-cell {
  padding: var(--md-space-sm) var(--md-space-md);
  font-size: var(--md-font-size-sm);
  display: flex;
  align-items: center;
  gap: var(--md-space-xs);
  min-height: 36px;
}

.label-cell {
  color: var(--md-text-secondary);
  font-weight: var(--md-font-weight-medium);
  border-right: 1px solid var(--md-outline-variant);
  align-items: center;
}

.value-cell {
  color: var(--md-text-primary);
  word-break: break-all;
  line-height: var(--md-line-height-normal);
  flex: 1;
  align-items: center;
}

.value-cell span {
  line-height: var(--md-line-height-normal);
}

/* XPath 和 Raw 特殊样式（等宽字体） */
.property-row:has(.label-cell:contains("xpath")) .value-cell,
.property-row:has(.label-cell:contains("raw")) .value-cell,
.value-cell.xpath-value,
.value-cell.raw-value {
  font-family: var(--md-font-family-mono);
  font-size: var(--md-font-size-xs);
  color: var(--md-primary);
}

.circle-icon {
  font-size: 6px;
  color: var(--md-text-secondary);
  flex-shrink: 0;
  margin-top: 2px;
}

/* Right Panel: Content Area */
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--md-surface);
}

/* Vertical Control Sidebar */
.control-sidebar {
  width: 44px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--md-space-md);
  padding: var(--md-space-sm) var(--md-space-xs);
  background: var(--md-surface-variant);
  border-right: 1px solid var(--md-outline);
  overflow-y: auto;
}

.control-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--md-space-xs);
  padding-bottom: var(--md-space-sm);
  border-bottom: 1px solid var(--md-outline-variant);
  width: 100%;
}

.control-group:last-child {
  border-bottom: none;
}

/* 纵向文字按钮 */
.vertical-text-btn {
  width: 28px !important;
  height: auto !important;
  min-height: 80px !important;
  padding: 8px 0 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
}

.vertical-text {
  font-family: var(--md-font-family) !important;
  writing-mode: vertical-rl;
  text-orientation: upright;
  letter-spacing: 1px;
  font-size: 11px;
  line-height: 1;
}

/* Screen Content Area */
.screen-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.text-input-bar {
  height: 40px;
  padding: 0 var(--md-space-md);
  display: flex;
  align-items: center;
  gap: var(--md-space-sm);
  border-bottom: 1px solid var(--md-outline);
  background: var(--md-surface-variant);
  flex-shrink: 0;
}

.screenshot-area {
  flex: 1;
  overflow: hidden;
  background: var(--md-surface-container);
  display: flex;
  flex-direction: column;
}

/* 强制 n-spin 组件铺满容器 */
.screenshot-area :deep(.n-spin-container),
.screenshot-area :deep(.n-spin-content) {
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}

.screenshot-wrapper {
  position: relative;
  display: inline-block;
  max-width: 100%;
  max-height: 100%;
  border-radius: var(--md-shape-corner-medium);
  overflow: hidden;
  box-shadow: var(--md-elevation-2);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--md-space-xxl) var(--md-space-lg);
}

.page-footer {
  height: 32px;
  padding: 0 var(--md-space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--md-outline);
  font-size: var(--md-font-size-xs);
  color: var(--md-text-secondary);
  background: var(--md-surface-variant);
  flex-shrink: 0;
}
</style>

<style>
/* 全局样式：针对 Teleport 到 body 的下拉菜单 */
.n-base-select-menu {
  min-width: 500px !important;
}

.n-base-select-menu .n-base-select-option {
  min-width: 500px !important;
  padding: 8px 12px !important;
}

.n-base-select-menu .n-base-select-option__content {
  width: 100% !important;
}

/* 隐藏勾选图标 */
.n-base-select-menu .n-base-select-option__check {
  display: none !important;
}

/* XPath 选项样式 */
.xpath-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}

.xpath-option-label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  min-width: 130px;
  flex-shrink: 0;
}

.xpath-option-right {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
  min-width: 0;
}

.xpath-option-preview {
  font-family: var(--md-font-family-mono);
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 350px;
  text-align: right;
}

.xpath-option-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  font-size: 13px;
  font-weight: bold;
  color: white;
  background-color: #2080f0; /* Naive UI 主题色 */
  border-radius: 50%;
  flex-shrink: 0;
}
</style>
