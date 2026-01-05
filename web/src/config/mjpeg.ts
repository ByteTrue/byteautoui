/**
 * MJPEG 流相关配置
 *
 * 集中管理环境变量和默认值，避免在各组件中分散读取
 */

/**
 * 是否优先使用 Canvas 渲染 MJPEG 流
 * 可通过环境变量 VITE_MJPEG_USE_CANVAS=true 开启
 */
export const PREFER_MJPEG_CANVAS = import.meta.env.VITE_MJPEG_USE_CANVAS === 'true'

/**
 * MJPEG 渲染最大帧率限制
 */
export const MJPEG_MAX_RENDER_FPS = 30

/**
 * MJPEG 渲染最小帧间隔（毫秒）
 */
export const MJPEG_MIN_RENDER_INTERVAL = 1000 / MJPEG_MAX_RENDER_FPS
