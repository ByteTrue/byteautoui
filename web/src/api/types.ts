// 设备信息
export interface DeviceInfo {
  serial: string
  status?: string
  name?: string
  model?: string
  product?: string
  enabled?: boolean
}

// 应用信息
export interface AppInfo {
  version: string
  description: string
  platform: string
  code_language: string
  cwd: string
  drivers: string[]
  ip?: string  // 可选的 IP 地址字段
}

// API 返回的原始节点结构
export interface RawUINode {
  key: string
  name: string
  bounds: [number, number, number, number] | null
  rect: { x: number; y: number; width: number; height: number } | null
  properties: {
    index?: string
    text?: string
    'resource-id'?: string
    class?: string
    package?: string
    'content-desc'?: string
    checkable?: string
    checked?: string
    clickable?: string
    enabled?: string
    focusable?: string
    focused?: string
    scrollable?: string
    'long-clickable'?: string
    password?: string
    selected?: string
    'visible-to-user'?: string
    bounds?: string
    'drawing-order'?: string
    hint?: string
    'display-id'?: string
    rotation?: string
    [key: string]: string | undefined
  }
  children: RawUINode[]
}

// 转换后的 UI 节点（供前端使用）
export interface UINode {
  key: string
  index?: number
  name?: string  // iOS: accessibility identifier
  text?: string
  label?: string
  resource_id?: string
  class_name?: string
  package?: string
  content_desc?: string
  checkable?: boolean
  checked?: boolean
  clickable?: boolean
  enabled?: boolean
  focusable?: boolean
  focused?: boolean
  scrollable?: boolean
  long_clickable?: boolean
  password?: boolean
  selected?: boolean
  visible_to_user?: boolean
  bounds?: [number, number, number, number]
  rect?: { x: number; y: number; width: number; height: number }
  children?: UINode[]
  xpath?: string
  properties?: Record<string, string>  // 原始属性
  [key: string]: unknown
}

// 层级数据
export interface HierarchyData {
  width: number
  height: number
  rotation?: number
  nodes: UINode[]
}

// 当前应用响应
export interface CurrentAppResponse {
  package: string
  activity: string
}

// 点击请求
export interface TapRequest {
  x: number
  y: number
}

// 平台类型
export type Platform = 'android' | 'ios' | 'harmony'

// iOS 配置
export interface IOSConfig {
  wda_bundle_id: string
  wda_port: number
}

// 转换原始节点为 UINode
export function convertRawNode(raw: RawUINode): UINode {
  const props = raw.properties || {}

  // 解析 bounds：优先使用API直接返回的bounds数组，否则从rect或字符串解析
  // 注意：iOS 返回归一化坐标 (0-1)，Android 返回像素坐标，前端 addRect 会统一处理
  let boundsArray: [number, number, number, number] | undefined

  if (raw.bounds) {
    // iOS/Android：直接使用 API 返回的 bounds（iOS 为归一化坐标，Android 为像素坐标）
    boundsArray = raw.bounds
  } else if (raw.rect) {
    // Android (U2)：从 rect 转换为 bounds 数组（像素坐标）
    boundsArray = [
      raw.rect.x,
      raw.rect.y,
      raw.rect.x + raw.rect.width,
      raw.rect.y + raw.rect.height,
    ]
  } else if (props.bounds) {
    // Android (ADB)：解析 bounds 字符串 "[0,0][100,100]"
    const match = props.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
    if (match && match[1] && match[2] && match[3] && match[4]) {
      boundsArray = [
        parseInt(match[1], 10),
        parseInt(match[2], 10),
        parseInt(match[3], 10),
        parseInt(match[4], 10),
      ]
    }
  }

  return {
    key: raw.key,
    index: props.index ? parseInt(props.index) : undefined,
    name: props.name || undefined,  // iOS: accessibility identifier
    text: props.text || undefined,
    label: props.label || undefined,
    resource_id: props['resource-id'] || undefined,
    class_name: props.class || raw.name || undefined,
    package: props.package || undefined,
    content_desc: props['content-desc'] || undefined,
    checkable: props.checkable === 'true',
    checked: props.checked === 'true',
    clickable: props.clickable === 'true',
    enabled: props.enabled === 'true',
    focusable: props.focusable === 'true',
    focused: props.focused === 'true',
    scrollable: props.scrollable === 'true',
    long_clickable: props['long-clickable'] === 'true',
    password: props.password === 'true',
    selected: props.selected === 'true',
    visible_to_user: props['visible-to-user'] === 'true',
    bounds: boundsArray,
    rect: raw.rect || undefined,
    properties: Object.fromEntries(
      Object.entries(props).filter(([, v]) => v !== undefined)
    ) as Record<string, string>,  // 过滤 undefined 值
    children: raw.children?.map(child => convertRawNode(child)),
  }
}

// API 返回的根节点（带width/height字段）
export interface RawHierarchyRoot extends RawUINode {
  width: number
  height: number
}

// 从原始 API 响应转换为 HierarchyData
export function convertRawHierarchy(raw: RawHierarchyRoot): HierarchyData {
  // 使用API返回的width和height（优先），如果不存在则从节点推断（向后兼容Android旧版本）
  let width = raw.width || 0
  let height = raw.height || 0

  // 如果API没有返回width/height，尝试从节点推断（Android旧逻辑）
  if (!width || !height) {
    function findScreenSize(node: RawUINode): void {
      if (node.rect) {
        const right = node.rect.x + node.rect.width
        const bottom = node.rect.y + node.rect.height
        if (right > width) width = right
        if (bottom > height) height = bottom
      }
      node.children?.forEach(findScreenSize)
    }
    findScreenSize(raw)
  }

  // 获取 rotation
  const rotation = raw.properties?.rotation ? parseInt(raw.properties.rotation) : 0

  return {
    width,
    height,
    rotation,
    nodes: raw.children?.map(child => convertRawNode(child)) || [],
  }
}
