<template>
  <div class="screen-panel" ref="containerRef">
    <!-- 模式选择器 - 固定顶部 -->
    <div class="mode-selector">
      <n-radio-group v-model:value="screenMode" size="small">
        <n-radio-button value="default">
          <n-icon><EyeOutline /></n-icon> {{ t.viewMode }}
        </n-radio-button>
        <n-radio-button value="pointer">
          <n-icon><FingerPrintOutline /></n-icon> {{ t.pointerMode }}
        </n-radio-button>
      </n-radio-group>
      <div class="info-display">
        <span v-if="showFps" class="fps-badge">{{ mjpeg.fps.value }} FPS</span>
        <span>{{ screenSize.width }}x{{ screenSize.height }}</span>
        <span>{{ mousePos.x }}, {{ mousePos.y }}</span>
        <span>{{ mousePosPercent.x }}%, {{ mousePosPercent.y }}%</span>
      </div>
    </div>

    <!-- Canvas 容器 - 居中显示 -->
    <div class="canvas-container">
      <div class="canvas-wrapper">
        <!-- 底层：截图/视频 -->
        <canvas
          v-if="!scrcpyMode && useMjpegCanvas"
          ref="mjpegCanvasRef"
          class="screen-image"
        />
        <img
          v-else-if="!scrcpyMode"
          ref="imageRef"
          :src="imageUrl"
          class="screen-image"
          @load="handleImageLoad"
          @error="handleImageError"
        />
        <video
          v-else
          ref="videoRef"
          class="screen-video"
          autoplay
          muted
        />

        <!-- 顶层：交互绘制层 -->
        <canvas
          ref="drawingCanvas"
          class="drawing-canvas"
          @mousemove="handleMouseMove"
          @mousedown="handleMouseDown"
          @mouseup="handleMouseUp"
          @mouseleave="handleMouseLeave"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick, toRefs } from 'vue'
import { NRadioGroup, NRadioButton, NIcon, useMessage } from 'naive-ui'
import { EyeOutline, FingerPrintOutline } from '@vicons/ionicons5'
import { useDrawingCanvas, type ScreenMode } from '@/composables/useDrawingCanvas'
import { useScrcpy } from '@/composables/useScrcpy'
import { useMjpeg } from '@/composables/useMjpeg'
import { PREFER_MJPEG_CANVAS } from '@/config/mjpeg'
import { useDeviceStore } from '@/stores/device'
import { useI18nStore } from '@/stores/i18n'
import type { Platform, UINode } from '@/api/types'
import { tap, sendCommand } from '@/api'
import type { Point } from '@/utils/shapes'

const props = defineProps<{
  platform: Platform
  serial: string
  screenSize?: { width: number; height: number }
  screenMode?: ScreenMode // 外部控制模式（用于断言）
}>()

const { platform, serial } = toRefs(props)

const emit = defineEmits<{
  tap: [x: number, y: number]
  recordTap: [x: number, y: number, selectedNode: UINode | null]
  recordSwipe: [startX: number, startY: number, endX: number, endY: number, duration: number, selectedNode: UINode | null]
  'element-selected': [node: UINode]
  'screenshot-cropped': [base64: string]
}>()

const message = useMessage()
const store = useDeviceStore()
const i18nStore = useI18nStore()

// 国际化文本
const t = computed(() => i18nStore.t.screen)

// 模式状态
const screenMode = ref<ScreenMode>('default')
const mousePos = ref({ x: 0, y: 0 })
const isDrawing = ref(false)
const trackPoints = ref<Point[]>([])

// 截图框选状态
const cropStartPoint = ref<Point | null>(null)
const cropEndPoint = ref<Point | null>(null)

// 同步外部传入的 screenMode
watch(
  () => props.screenMode,
  (mode) => {
    if (mode) {
      screenMode.value = mode
    }
  },
  { immediate: true }
)

// 平台特定的视频模式判断
const scrcpyMode = computed(() => platform.value === 'android' && screenMode.value === 'pointer')
const mjpegMode = computed(() => platform.value === 'ios' && screenMode.value === 'pointer')

// 元素引用
const imageRef = ref<HTMLImageElement | null>(null)
const mjpegCanvasRef = ref<HTMLCanvasElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)

// Canvas 绘制
const {
  canvasRef: drawingCanvas,
  addRect,
  addTrack,
  addCropRect,
  clearShapes,
  clearShapesByType,
  resizeCanvas,
} = useDrawingCanvas()

// Scrcpy WebSocket 视频流（始终创建实例，连接/断开由 watch 控制）
const scrcpy = useScrcpy({
  platform,
  serial,
  videoRef,
})

// iOS MJPEG 流（始终创建实例，启动/停止由 mjpegMode 控制）
const mjpeg = useMjpeg({
  platform,
  serial,
  enabled: mjpegMode,
  canvasRef: mjpegCanvasRef,
  preferCanvas: PREFER_MJPEG_CANVAS,
})

const useMjpegCanvas = computed(() => mjpeg.useCanvasRenderer.value)

// iOS MJPEG 启动失败提示
watch(
  () => mjpeg.error.value,
  (err, prev) => {
    if (err && err !== prev) {
      message.error(err)
    }
  }
)

// iOS 指针模式显示 FPS
const showFps = computed(() => mjpegMode.value && mjpeg.fps.value > 0)

// 动态图片 URL：iOS 指针模式使用 MJPEG，否则使用截图
const imageUrl = computed(() => {
  if (mjpegMode.value && mjpeg.streamUrl.value) {
    return mjpeg.streamUrl.value
  }
  return store.screenshotUrl
})

// 屏幕尺寸（优先使用外部传入的 props）
const screenSize = computed(() => ({
  width: props.screenSize?.width || store.screenSize?.width || 0,
  height: props.screenSize?.height || store.screenSize?.height || 0,
}))

// 计算鼠标位置百分比
const mousePosPercent = computed(() => {
  const width = screenSize.value.width
  const height = screenSize.value.height
  if (!width || !height) {
    return { x: 0, y: 0 }
  }
  return {
    x: Math.round((mousePos.value.x / width) * 100),
    y: Math.round((mousePos.value.y / height) * 100),
  }
})

// 图片加载处理
function handleImageLoad() {
  if (!imageRef.value) return

  // 调整 Canvas 尺寸匹配图片
  const width = imageRef.value.naturalWidth
  const height = imageRef.value.naturalHeight
  resizeCanvas(width, height)

  // iOS MJPEG 模式：更新 FPS
  if (mjpegMode.value) {
    mjpeg.updateFps()
  }
}

function handleImageError() {
  message.error('截图加载失败')
}

// 视频加载处理 (Scrcpy 模式)
function handleVideoLoad() {
  if (!videoRef.value) return

  // 调整 Canvas 尺寸匹配视频
  const width = videoRef.value.videoWidth || screenSize.value.width
  const height = videoRef.value.videoHeight || screenSize.value.height
  resizeCanvas(width, height)

  // 连接 Scrcpy WebSocket
  if (scrcpy && !scrcpy.connected.value) {
    scrcpy.connect()
  }
}

// 监听模式切换,处理状态清理
watch(
  () => screenMode.value,
  (newMode) => {
    if (newMode === 'pointer') {
      // 切换到指针模式:清空选中状态,避免遮罩影响操作
      store.selectNode(null)
      clearShapesByType('select')
      clearShapesByType('hover')
    }
  }
)

// 监听 scrcpyMode 变化，动态连接/断开 WebSocket
watch(
  () => scrcpyMode.value,
  async (newMode, oldMode) => {
    // 避免初始化时的无意义断开
    if (oldMode === undefined && !newMode) {
      console.log('[ScreenPanel] Initial state: Screenshot mode')
      return
    }

    if (newMode) {
      // 切换到 Video 模式：等待 DOM 更新后建立 WebSocket 连接
      console.log('[ScreenPanel] Switching to Scrcpy mode, waiting for video element...')
      await nextTick() // 等待 Vue 完成 DOM 更新
      console.log('[ScreenPanel] Video element ready, connecting...')
      scrcpy.connect()
    } else {
      // 切换回 Screenshot 模式：断开 WebSocket 连接
      console.log('[ScreenPanel] Switching to Screenshot mode, disconnecting...')
      scrcpy.disconnect()
    }
  }
)

// 视频元素准备就绪时调整 Canvas 尺寸
watch(
  videoRef,
  (video) => {
    if (video && scrcpyMode.value) {
      video.addEventListener('loadedmetadata', handleVideoLoad)
    }
  },
  { immediate: true }
)

// 清理 Scrcpy 连接
onUnmounted(() => {
  scrcpy.disconnect()
})

// MJPEG Canvas 尺寸变化时同步绘制层（使用 ResizeObserver）
let mjpegResizeObserver: ResizeObserver | null = null

watch(
  mjpegCanvasRef,
  (canvas, prevCanvas) => {
    // 清理旧的 observer
    if (mjpegResizeObserver && prevCanvas) {
      mjpegResizeObserver.unobserve(prevCanvas)
    }
    // 创建或复用 observer
    if (canvas) {
      if (!mjpegResizeObserver) {
        mjpegResizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLCanvasElement
            if (target.width && target.height) {
              resizeCanvas(target.width, target.height)
            }
          }
        })
      }
      mjpegResizeObserver.observe(canvas)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (mjpegResizeObserver) {
    mjpegResizeObserver.disconnect()
    mjpegResizeObserver = null
  }
})

// 坐标转换：屏幕坐标 -> 设备坐标
function getDeviceCoords(e: MouseEvent): { x: number; y: number } | null {
  const element = getActiveMediaElement()
  if (!element) return null

  const rect = element.getBoundingClientRect()
  const { width, height } = screenSize.value
  if (!width || !height) return null

  const scaleX = width / rect.width
  const scaleY = height / rect.height

  const x = Math.round((e.clientX - rect.left) * scaleX)
  const y = Math.round((e.clientY - rect.top) * scaleY)

  return { x, y }
}

function getActiveMediaElement(): HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null {
  if (scrcpyMode.value) return videoRef.value
  if (useMjpegCanvas.value) return mjpegCanvasRef.value
  return imageRef.value
}

// 坐标转换：屏幕坐标 -> Canvas 坐标（考虑 Canvas 内部分辨率缩放）
function getCanvasCoords(e: MouseEvent): { x: number; y: number } | null {
  if (!drawingCanvas.value) return null

  const rect = drawingCanvas.value.getBoundingClientRect()

  // Canvas 内部分辨率 / CSS 显示尺寸 = 缩放因子
  const scaleX = drawingCanvas.value.width / rect.width
  const scaleY = drawingCanvas.value.height / rect.height

  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY

  return { x, y }
}

// 坐标转换：Canvas 坐标 -> 设备坐标
function canvasToDeviceCoords(point: Point): { x: number; y: number } | null {
  if (!drawingCanvas.value) return null

  const { width, height } = screenSize.value
  if (!width || !height) return null

  // Canvas 内部分辨率可能与设备分辨率不同（截图/视频可能被压缩）
  // 需要按比例缩放到设备坐标系
  const scaleX = width / drawingCanvas.value.width
  const scaleY = height / drawingCanvas.value.height

  const x = Math.round(point.x * scaleX)
  const y = Math.round(point.y * scaleY)

  return { x, y }
}

// 查找鼠标位置的 UI 节点（最小包含）
function findNodeAtPosition(x: number, y: number): UINode | null {
  if (!store.hierarchy?.nodes) return null

  const { width, height } = screenSize.value
  if (!width || !height) return null

  // 转换为归一化坐标（0-1）以匹配bounds格式
  const normalizedX = x / width
  const normalizedY = y / height

  const allNodes: UINode[] = []
  function flatten(nodes: UINode[]) {
    nodes.forEach(node => {
      if (node.children) flatten(node.children)
      allNodes.push(node)
    })
  }
  flatten(store.hierarchy.nodes)

  let result: UINode | null = null
  let minArea = Infinity

  for (const node of allNodes) {
    if (!node.bounds) continue
    const [rawLeft, rawTop, rawRight, rawBottom] = node.bounds
    const normalizedBounds = rawRight <= 1 && rawBottom <= 1

    const left = normalizedBounds ? rawLeft : rawLeft / width
    const top = normalizedBounds ? rawTop : rawTop / height
    const right = normalizedBounds ? rawRight : rawRight / width
    const bottom = normalizedBounds ? rawBottom : rawBottom / height

    if (normalizedX >= left && normalizedX <= right && normalizedY >= top && normalizedY <= bottom) {
      const area = (right - left) * (bottom - top)
      if (area < minArea) {
        minArea = area
        result = node
      }
    }
  }

  return result
}

// 鼠标移动处理
function handleMouseMove(e: MouseEvent) {
  const deviceCoords = getDeviceCoords(e)
  const canvasCoords = getCanvasCoords(e)
  if (!deviceCoords || !canvasCoords) return

  mousePos.value = deviceCoords

  // 清除之前的悬停高亮
  clearShapesByType('hover')

  if (screenMode.value === 'default' || screenMode.value === 'assert-element') {
    // 查看模式 / 元素选择模式：悬停高亮 UI 元素
    const hoveredNode = findNodeAtPosition(deviceCoords.x, deviceCoords.y)
    if (hoveredNode && hoveredNode.bounds) {
      addRect(hoveredNode.bounds, 'hover')
    }
  } else if (screenMode.value === 'assert-screenshot' && isDrawing.value) {
    // 截图框选模式：动态绘制选区矩形
    cropEndPoint.value = canvasCoords

    // 清除之前的选区，绘制新的
    clearShapesByType('crop')

    const x = Math.min(cropStartPoint.value!.x, cropEndPoint.value.x)
    const y = Math.min(cropStartPoint.value!.y, cropEndPoint.value.y)
    const width = Math.abs(cropEndPoint.value.x - cropStartPoint.value!.x)
    const height = Math.abs(cropEndPoint.value.y - cropStartPoint.value!.y)

    addCropRect(x, y, width, height)
  } else if (screenMode.value === 'pointer') {
    // 指针模式：记录轨迹点（所有模式都记录，用于判断tap/swipe）
    if (isDrawing.value) {
      trackPoints.value.push(canvasCoords)
      clearShapesByType('hover')
      addTrack(trackPoints.value)

      // scrcpy模式：发送实时触摸移动事件
      if (scrcpyMode.value) {
        const { width, height } = screenSize.value
        if (width && height) {
          scrcpy.sendTouch('move', deviceCoords.x, deviceCoords.y, width, height)
        }
      }
    }
  }
}

// 鼠标按下
function handleMouseDown(e: MouseEvent) {
  const deviceCoords = getDeviceCoords(e)
  const canvasCoords = getCanvasCoords(e)
  if (!deviceCoords || !canvasCoords) return

  isDrawing.value = true
  trackPoints.value = []

  if (screenMode.value === 'assert-screenshot') {
    // 截图框选模式：记录起点
    cropStartPoint.value = canvasCoords
    cropEndPoint.value = canvasCoords
  } else if (screenMode.value === 'pointer') {
    // 指针模式：记录第一个轨迹点（所有模式都记录）
    trackPoints.value.push(canvasCoords)

    // scrcpy模式：发送触摸按下事件
    if (scrcpyMode.value) {
      const { width, height } = screenSize.value
      if (width && height) {
        scrcpy.sendTouch('down', deviceCoords.x, deviceCoords.y, width, height)
      }
    }
  }
}

// 计算滑动参数（从轨迹点提取起点、终点、时长）
function getSwipeParams(): { startX: number; startY: number; endX: number; endY: number; duration: number } | null {
  if (trackPoints.value.length < 2) return null

  const startPoint = trackPoints.value[0]!
  const endPoint = trackPoints.value[trackPoints.value.length - 1]!
  const startDevice = canvasToDeviceCoords(startPoint)
  const endDevice = canvasToDeviceCoords(endPoint)

  if (!startDevice || !endDevice) return null

  // 计算滑动时长（基于轨迹点数量估算，约60fps），限制0.2-1.0秒
  const duration = Math.max(0.2, Math.min(1.0, trackPoints.value.length / 60))

  return {
    startX: startDevice.x,
    startY: startDevice.y,
    endX: endDevice.x,
    endY: endDevice.y,
    duration,
  }
}

/**
 * 裁剪当前屏幕截图的指定区域
 * @param start Canvas 起点坐标
 * @param end Canvas 终点坐标
 * @returns Base64 编码的裁剪图片（data:image/png;base64,...）
 */
async function cropScreenshot(start: Point, end: Point): Promise<string> {
  // 计算裁剪区域（Canvas 坐标系）
  const x = Math.min(start.x, end.x)
  const y = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)

  // 获取当前截图源（img 或 canvas）
  const sourceElement = getActiveMediaElement()
  if (!sourceElement) {
    throw new Error('无法获取屏幕截图源')
  }

  // 创建临时 Canvas 进行裁剪
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = width
  tempCanvas.height = height
  const tempCtx = tempCanvas.getContext('2d')
  if (!tempCtx) {
    throw new Error('无法创建 Canvas 上下文')
  }

  // 绘制裁剪区域
  if (sourceElement instanceof HTMLImageElement) {
    // 从 <img> 裁剪
    const scaleX = sourceElement.naturalWidth / drawingCanvas.value!.width
    const scaleY = sourceElement.naturalHeight / drawingCanvas.value!.height
    tempCtx.drawImage(
      sourceElement,
      x * scaleX, y * scaleY, width * scaleX, height * scaleY, // 源区域
      0, 0, width, height // 目标区域
    )
  } else if (sourceElement instanceof HTMLCanvasElement) {
    // 从 Canvas 裁剪（MJPEG 模式）
    tempCtx.drawImage(
      sourceElement,
      x, y, width, height, // 源区域
      0, 0, width, height  // 目标区域
    )
  }

  // 转换为 Base64
  return tempCanvas.toDataURL('image/png')
}

// 鼠标抬起
async function handleMouseUp(e: MouseEvent) {
  const deviceCoords = getDeviceCoords(e)
  if (!deviceCoords) return

  isDrawing.value = false

  if (screenMode.value === 'default') {
    // 查看模式：选中元素
    const selectedNode = findNodeAtPosition(deviceCoords.x, deviceCoords.y)
    if (selectedNode) {
      store.selectNode(selectedNode)
      clearShapesByType('select')
      if (selectedNode.bounds) {
        addRect(selectedNode.bounds, 'select')
      }
    }
  } else if (screenMode.value === 'assert-element') {
    // 元素选择模式：点击后提取 XPath 和属性
    const selectedNode = findNodeAtPosition(deviceCoords.x, deviceCoords.y)
    if (selectedNode) {
      emit('element-selected', selectedNode)
      // 清除高亮
      clearShapesByType('hover')
    }
  } else if (screenMode.value === 'assert-screenshot') {
    // 截图框选模式：裁剪图片并返回 Base64
    if (cropStartPoint.value && cropEndPoint.value) {
      try {
        const croppedBase64 = await cropScreenshot(cropStartPoint.value, cropEndPoint.value)
        emit('screenshot-cropped', croppedBase64)
      } catch (error) {
        message.error(`截图裁剪失败: ${error instanceof Error ? error.message : String(error)}`)
      }

      // 清理框选状态
      clearShapesByType('crop')
      cropStartPoint.value = null
      cropEndPoint.value = null
    }
  } else if (screenMode.value === 'pointer') {
    // 指针模式：发送触摸抬起事件
    try {
      emit('tap', deviceCoords.x, deviceCoords.y)

      // 指针模式下不记录元素信息，仅记录坐标
      const selectedNode = null
      const isSwipe = trackPoints.value.length > 5

      if (scrcpyMode.value) {
        // scrcpy模式：发送实时触摸抬起
        const { width, height } = screenSize.value
        if (width && height) {
          scrcpy.sendTouch('up', deviceCoords.x, deviceCoords.y, width, height)
        }

        // 判断是tap还是swipe，emit录制事件
        const swipeParams = isSwipe ? getSwipeParams() : null
        if (swipeParams) {
          emit('recordSwipe', swipeParams.startX, swipeParams.startY, swipeParams.endX, swipeParams.endY, swipeParams.duration, selectedNode)
        } else {
          emit('recordTap', deviceCoords.x, deviceCoords.y, selectedNode)
        }
      } else {
        // 非scrcpy模式：使用HTTP API（降级方案）
        const swipeParams = isSwipe ? getSwipeParams() : null
        if (swipeParams) {
          await sendCommand(props.platform, props.serial, 'swipe', {
            startX: swipeParams.startX,
            startY: swipeParams.startY,
            endX: swipeParams.endX,
            endY: swipeParams.endY,
            duration: swipeParams.duration,
          })
          emit('recordSwipe', swipeParams.startX, swipeParams.startY, swipeParams.endX, swipeParams.endY, swipeParams.duration, selectedNode)
          message.success(`滑动: (${swipeParams.startX}, ${swipeParams.startY}) → (${swipeParams.endX}, ${swipeParams.endY})`)
        } else {
          await tap(props.platform, props.serial, deviceCoords.x, deviceCoords.y)
          emit('recordTap', deviceCoords.x, deviceCoords.y, selectedNode)
          message.success(`点击: (${deviceCoords.x}, ${deviceCoords.y})`)
        }
      }
    } catch (error) {
      message.error(`操作失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 清除绘制轨迹
  trackPoints.value = []
  clearShapesByType('hover')
}

// 鼠标离开
function handleMouseLeave() {
  // 如果正在拖动，发送触摸抬起（防止触摸卡住）
  if (isDrawing.value && screenMode.value === 'pointer' && scrcpyMode.value) {
    const lastPoint = trackPoints.value[trackPoints.value.length - 1]
    if (lastPoint) {
      const deviceCoords = canvasToDeviceCoords(lastPoint)
      const { width, height } = screenSize.value
      if (deviceCoords && width && height) {
        scrcpy.sendTouch('up', deviceCoords.x, deviceCoords.y, width, height)
      }
    }
  }

  isDrawing.value = false
  trackPoints.value = []
  clearShapesByType('hover')
}

// 监听选中节点变化
watch(
  () => store.selectedNode,
  (node) => {
    clearShapesByType('select')
    if (node && node.bounds) {
      addRect(node.bounds, 'select')
    }
  }
)

// 对外暴露方法
defineExpose({
  clearShapes,
  resizeCanvas,
})
</script>

<style scoped>
.screen-panel {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  background: var(--md-surface-container);
}

.mode-selector {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--md-surface-variant);
  border-bottom: 1px solid var(--md-outline);
  min-height: 32px;
  flex-shrink: 0 !important;
  width: 100%;
}

.info-display {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--md-font-family-mono);
  font-size: var(--md-font-size-xs);
  color: var(--md-text-secondary);
}

.fps-badge {
  background: var(--md-primary);
  color: var(--md-on-primary);
  padding: 2px 6px;
  border-radius: var(--md-shape-corner-small);
  font-weight: 500;
}

.canvas-container {
  flex: 1 1 auto !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  min-height: 0 !important;
  overflow: hidden !important;
  padding: var(--md-space-xs) !important;
  width: 100% !important;
}

.canvas-wrapper {
  position: relative;
  display: inline-block;
  max-width: 100%;
  max-height: 100%;
  background: #000;
  border-radius: var(--md-shape-corner-medium);
  box-shadow: var(--md-elevation-2);
  overflow: visible;
}

.screen-image,
.screen-video {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 180px);
  width: auto;
  height: auto;
  object-fit: contain;
}

.drawing-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100% !important;
  height: 100% !important;
  cursor: crosshair;
  pointer-events: all;
}
</style>
