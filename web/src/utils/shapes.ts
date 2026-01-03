/**
 * Canvas 绘制系统 - 基于原版逆向分析
 * 参考：static-original/assets/index-9353aa21.js
 */

export interface Point {
  x: number
  y: number
}

export type ShapeStyle = 'hover' | 'select' | 'crosshair'

export abstract class Shape {
  name: string
  style: ShapeStyle

  constructor(name: string, style: ShapeStyle) {
    this.name = name
    this.style = style
  }

  abstract draw(ctx: CanvasRenderingContext2D): void
}

/**
 * 矩形元素（UI 元素边界框）
 */
export class RectShape extends Shape {
  x: number
  y: number
  width: number
  height: number

  constructor(x: number, y: number, width: number, height: number, style: ShapeStyle) {
    super('rect', style)
    this.x = x
    this.y = y
    this.width = width
    this.height = height
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath()
    ctx.rect(this.x, this.y, this.width, this.height)

    // 根据样式设置颜色
    if (this.style === 'select') {
      // 选中元素：黄色高亮
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'
      ctx.strokeStyle = '#FFD700'
      ctx.lineWidth = 3
    } else if (this.style === 'hover') {
      // 悬停元素：蓝色高亮
      ctx.fillStyle = 'rgba(0, 150, 255, 0.2)'
      ctx.strokeStyle = '#0096FF'
      ctx.lineWidth = 2
    }

    ctx.fill()
    ctx.stroke()
  }
}

/**
 * 十字准星（取色模式）
 */
export class CrosshairShape extends Shape {
  x: number
  y: number
  canvasWidth: number
  canvasHeight: number

  constructor(x: number, y: number, canvasWidth: number, canvasHeight: number) {
    super('crosshair', 'crosshair')
    this.x = x
    this.y = y
    this.canvasWidth = canvasWidth
    this.canvasHeight = canvasHeight
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath()
    ctx.strokeStyle = '#FF0000'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])

    // 水平线
    ctx.moveTo(0, this.y)
    ctx.lineTo(this.canvasWidth, this.y)

    // 垂直线
    ctx.moveTo(this.x, 0)
    ctx.lineTo(this.x, this.canvasHeight)

    ctx.stroke()
    ctx.setLineDash([]) // 重置虚线
  }
}

/**
 * 触摸轨迹（Scrcpy 模式下的手指拖动轨迹）
 */
export class TrackShape extends Shape {
  points: Point[]

  constructor(points: Point[]) {
    super('track', 'hover')
    this.points = points
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.points.length < 2) return

    ctx.beginPath()
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const firstPoint = this.points[0]
    if (firstPoint) {
      ctx.moveTo(firstPoint.x, firstPoint.y)
    }

    for (let i = 1; i < this.points.length; i++) {
      const point = this.points[i]
      if (point) {
        ctx.lineTo(point.x, point.y)
      }
    }

    ctx.stroke()
  }
}
