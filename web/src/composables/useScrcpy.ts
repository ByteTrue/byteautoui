/**
 * Scrcpy WebSocket 实时视频流管理
 * 基于原版逆向：WebSocket arraybuffer + JMuxer H.264 解码
 */

import { ref, onUnmounted, type Ref } from 'vue'
// @ts-expect-error - JMuxer 没有类型定义
import JMuxer from 'jmuxer'
import type { Platform } from '@/api/types'

export interface ScrcpyOptions {
  platform: Ref<Platform>
  serial: Ref<string>
  videoRef: Ref<HTMLVideoElement | null>
}

export function useScrcpy(options: ScrcpyOptions) {
  const { platform, serial, videoRef } = options

  const connected = ref(false)
  const reconnecting = ref(false)
  const error = ref<string | null>(null)

  let ws: WebSocket | null = null
  let jmuxer: any = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const reconnectInterval = 3000

  /**
   * 初始化 JMuxer 解码器
   */
  function initJMuxer() {
    if (!videoRef.value) {
      const errMsg = 'Video element not ready'
      error.value = errMsg
      console.error('[Scrcpy]', errMsg)
      return false
    }

    try {
      console.log('[Scrcpy] Initializing JMuxer for video element:', videoRef.value)
      jmuxer = new JMuxer({
        node: videoRef.value,
        mode: 'video',
        flushingTime: 0,
        fps: 30,
        debug: false,
      })
      console.log('[Scrcpy] JMuxer initialized successfully')
      return true
    } catch (err) {
      const errMsg = `JMuxer init failed: ${err instanceof Error ? err.message : String(err)}`
      error.value = errMsg
      console.error('[Scrcpy]', errMsg, err)
      return false
    }
  }

  /**
   * 连接 Scrcpy WebSocket
   */
  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.warn('[Scrcpy] WebSocket already connected')
      return
    }

    // 检查videoRef是否存在（查看模式下videoRef为null，不应连接）
    if (!videoRef.value) {
      console.warn('[Scrcpy] Video element not available, cannot connect')
      return
    }

    // 确保 JMuxer 已初始化
    if (!jmuxer && !initJMuxer()) {
      return
    }

    try {
      // 构建 WebSocket URL
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${location.host}/ws/${platform.value}/scrcpy/${serial.value}`

      console.log(`[Scrcpy] Connecting to ${wsUrl}`)
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer' // 关键：接收二进制数据

      ws.onopen = () => {
        connected.value = true
        reconnecting.value = false
        error.value = null
        console.log('[Scrcpy] Connected')

        // 清除重连定时器
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
      }

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // H.264 视频数据流
          if (jmuxer && event.data.byteLength > 0) {
            try {
              jmuxer.feed({
                video: new Uint8Array(event.data),
              })
            } catch (err) {
              console.error('[Scrcpy] JMuxer feed error:', err)
            }
          }
        } else {
          // 控制消息（JSON）
          try {
            const data = JSON.parse(event.data)
            console.log('[Scrcpy] Control message:', data)
          } catch (parseErr) {
            console.warn('[Scrcpy] Invalid message:', event.data, parseErr)
          }
        }
      }

      ws.onerror = (event) => {
        const errMsg = 'WebSocket connection error'
        console.error('[Scrcpy]', errMsg, event)
        console.error('[Scrcpy] WebSocket URL was:', wsUrl)
        console.error('[Scrcpy] WebSocket readyState:', ws?.readyState)
        error.value = errMsg
      }

      ws.onclose = () => {
        connected.value = false
        console.log('[Scrcpy] Disconnected')

        // 自动重连（仅在videoRef存在时）
        if (!reconnecting.value && videoRef.value) {
          reconnecting.value = true
          console.log(`[Scrcpy] Reconnecting in ${reconnectInterval}ms...`)

          reconnectTimer = setTimeout(() => {
            connect()
          }, reconnectInterval)
        }
      }
    } catch (err) {
      error.value = `WebSocket init failed: ${err instanceof Error ? err.message : String(err)}`
      console.error('[Scrcpy] Connection error:', err)
    }
  }

  /**
   * 断开连接
   */
  function disconnect() {
    reconnecting.value = false

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      ws.close()
      ws = null
    }

    if (jmuxer) {
      try {
        jmuxer.destroy()
      } catch (err) {
        console.warn('[Scrcpy] JMuxer destroy error:', err)
      }
      jmuxer = null
    }

    connected.value = false
    error.value = null
    console.log('[Scrcpy] Disconnected and cleaned up')
  }

  /**
   * 发送触摸事件到 Scrcpy
   * @param action 触摸动作类型
   * @param x 绝对X坐标（设备坐标）
   * @param y 绝对Y坐标（设备坐标）
   * @param width 设备屏幕宽度
   * @param height 设备屏幕高度
   */
  function sendTouch(action: 'down' | 'move' | 'up', x: number, y: number, width: number, height: number) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[Scrcpy] WebSocket not connected')
      return
    }

    // 转换为百分比坐标（后端期望xP, yP）
    const xP = x / width
    const yP = y / height

    // 后端期望的消息格式：touchDown/touchMove/touchUp with xP, yP
    const messageType = action === 'down' ? 'touchDown'
                      : action === 'move' ? 'touchMove'
                      : 'touchUp'

    const message = JSON.stringify({
      type: messageType,
      xP,
      yP,
    })

    ws.send(message)
  }

  // 组件卸载时清理
  onUnmounted(() => {
    disconnect()
  })

  return {
    connected,
    reconnecting,
    error,
    connect,
    disconnect,
    sendTouch,
  }
}
