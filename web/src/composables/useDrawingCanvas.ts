/**
 * Canvas 绘制层 Composable
 * 基于原版逆向：双 Canvas 架构（底层图片 + 顶层交互绘制）
 */

import { ref, computed } from 'vue'
import { Shape, RectShape, CrosshairShape, TrackShape, type Point } from '@/utils/shapes'

export type ScreenMode = 'default' | 'pointer' | 'crosshair'

export function useDrawingCanvas() {
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const ctx = computed(() => canvasRef.value?.getContext('2d') || null)

  const shapes = ref<Shape[]>([])

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
    const [left, top, right, bottom] = bounds
    const width = right - left
    const height = bottom - top

    shapes.value.push(new RectShape(left, top, width, height, style))
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
  function clearShapesByType(type: 'hover' | 'select' | 'crosshair') {
    shapes.value = shapes.value.filter(shape => shape.style !== type)
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
    clearShapes,
    clearShapesByType,
    resizeCanvas,
    redraw,
  }
}
