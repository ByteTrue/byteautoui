import type { RecordedAction, ElementInfo, AssertParams } from '@/types/recording'

/**
 * 格式化持续时间（毫秒 -> MM:SS）
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * 格式化相对时间
 */
export function formatRelativeTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = (ms / 1000).toFixed(1)
  return `${seconds}s`
}

/**
 * 格式化完成后等待时间
 */
export function formatWaitAfter(ms: number | undefined): string {
  if (ms === undefined || ms === null || ms === 0) return '-'
  if (ms < 1000) return `+${ms}ms`
  const seconds = (ms / 1000).toFixed(1)
  return `+${seconds}s`
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * 格式化日期
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays < 7) {
    return `${diffDays}天前`
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }
}

/**
 * 格式化元素描述(优先级: text > label > content_desc > resource_id > class_name)
 */
export function formatElementDesc(element: ElementInfo | undefined): string | null {
  if (!element) return null
  if (element.text) return `文本: "${element.text}"`
  if (element.label) return `label: "${element.label}"`
  if (element.content_desc) return `描述: "${element.content_desc}"`
  if (element.resource_id) return `ID: ${element.resource_id.split('/').pop()}`
  if (element.class_name) return `类: ${element.class_name.split('.').pop()}`
  return null
}

/**
 * 格式化操作参数
 */
export function formatActionParams(action: RecordedAction): string {
  switch (action.type) {
    case 'tap': {
      const desc = formatElementDesc(action.element)
      if (desc) return desc
      if (action.xpath) {
        return `XPath元素 (${Math.round(action.coords!.x)}, ${Math.round(action.coords!.y)})`
      }
      return `坐标 (${Math.round(action.coords!.x)}, ${Math.round(action.coords!.y)})`
    }
    case 'swipe': {
      const elementDesc = formatElementDesc(action.element)
      if (elementDesc) {
        return `${elementDesc} → (${Math.round(action.endCoords!.x)}, ${Math.round(action.endCoords!.y)})`
      }
      return `(${Math.round(action.coords!.x)}, ${Math.round(action.coords!.y)}) → (${Math.round(action.endCoords!.x)}, ${Math.round(action.endCoords!.y)})`
    }
    case 'input': {
      const params = action.params as { text: string }
      return `"${params.text}"`
    }
    case 'sleep': {
      const params = action.params as { duration: number }
      return `${params.duration}ms`
    }
    case 'command': {
      const params = action.params as { command: string }
      return params.command
    }
    case 'assert': {
      const params = action.params as AssertParams
      // 优先显示用户自定义描述
      if (params.description) {
        return params.description
      }
      // 默认显示条件数量和运算符
      const count = params.conditions.length
      const op = params.operator.toUpperCase()
      return `${count}个条件 (${op})`
    }
    default:
      return JSON.stringify(action.params)
  }
}

/**
 * 获取操作类型对应的颜色
 */
export function getActionTypeColor(type: string): 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' {
  switch (type) {
    case 'tap':
      return 'primary'
    case 'swipe':
      return 'success'
    case 'input':
      return 'warning'
    case 'sleep':
      return 'default'
    case 'command':
    case 'back':
    case 'home':
      return 'error'
    case 'assert':
      return 'info'
    default:
      return 'default'
  }
}

/**
 * 获取回放状态对应的颜色
 */
export function getPlaybackStateColor(state: string): 'default' | 'primary' | 'success' | 'warning' | 'error' {
  switch (state) {
    case 'idle':
      return 'default'
    case 'playing':
      return 'success'
    case 'paused':
      return 'warning'
    case 'completed':
      return 'primary'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

/**
 * 获取回放状态文本
 */
export function getPlaybackStateText(state: string): string {
  switch (state) {
    case 'idle':
      return '待播放'
    case 'playing':
      return '播放中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'error':
      return '错误'
    default:
      return state
  }
}
