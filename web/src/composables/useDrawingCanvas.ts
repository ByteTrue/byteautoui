/**
 * Canvas 绘制层 Composable
 * 基于原版逆向：双 Canvas 架构（底层图片 + 顶层交互绘制）
 */

import { ref, computed } from 'vue'
import { Shape, RectShape, CrosshairShape, TrackShape, CropRectShape, type Point } from '@/utils/shapes'

export type ScreenMode = 'default' | 'pointer' | 'crosshair' | 'assert-element' | 'assert-screenshot'

export function useDrawingCanvas() {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const ctx = computed(() => canvasRef.value?.getContext('2d') || null)

  const shapes = ref<Shape[]>([])

  function isNormalizedBounds(bounds: [number, number, number, number]): boolean {
    return bounds.every(v => Number.isFinite(v) && v >= 0 && v <= 1)
  }

  /**
   * 清空画布并重绘所有形状
   */
  function redraw() {
    if (!ctx.value || !canvasRef.value) return

    const canvas = canvasRef.value
    ctx.value.clearRect(0, 0, canvas.width, canvas.height)

    shapes.value.forEach(shape => {
      if (ctx.value) {
        shape.draw(ctx.value)
      }
    })
  }

  /**
   * 添加矩形高亮（UI 元素边界）
   */
  function addRect(bounds: [number, number, number, number], style: 'hover' | 'select') {
    if (!canvasRef.value) return

    const [left, top, right, bottom] = bounds
    const canvasWidth = canvasRef.value.width
    const canvasHeight = canvasRef.value.height

    const normalized = isNormalizedBounds(bounds)
    const x1 = normalized ? left * canvasWidth : left
    const y1 = normalized ? top * canvasHeight : top
    const x2 = normalized ? right * canvasWidth : right
    const y2 = normalized ? bottom * canvasHeight : bottom

    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    const width = Math.abs(x2 - x1)
    const height = Math.abs(y2 - y1)

    shapes.value.push(new RectShape(x, y, width, height, style))
    redraw()
  }

  /**
   * 添加十字准星（取色模式）
   */
  function addCrosshair(x: number, y: number) {
    if (!canvasRef.value) return

    shapes.value.push(
      new CrosshairShape(x, y, canvasRef.value.width, canvasRef.value.height)
    )
    redraw()
  }

  /**
   * 添加触摸轨迹（Scrcpy 拖动）
   */
  function addTrack(points: Point[]) {
    shapes.value.push(new TrackShape(points))
    redraw()
  }

  /**
   * 清空所有形状
   */
  function clearShapes() {
    shapes.value = []
    redraw()
  }

  /**
   * 仅清除指定类型的形状
   */
  function clearShapesByType(type: 'hover' | 'select' | 'crosshair' | 'crop') {
    shapes.value = shapes.value.filter(shape => shape.style !== type)
    redraw()
  }

  /**
   * 添加截图裁剪矩形
   */
  function addCropRect(x: number, y: number, width: number, height: number) {
    shapes.value.push(new CropRectShape(x, y, width, height))
    redraw()
  }

  /**
   * 调整 Canvas 尺寸以匹配底层图片/视频
   */
  function resizeCanvas(width: number, height: number) {
    if (!canvasRef.value) return

    canvasRef.value.width = width
    canvasRef.value.height = height
    redraw()
  }

  return {
    canvasRef,
    addRect,
    addCrosshair,
    addTrack,
    addCropRect,
    clearShapes,
    clearShapesByType,
    resizeCanvas,
    redraw,
  }
}
