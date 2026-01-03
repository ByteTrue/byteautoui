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
  text?: string
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

// 转换原始节点为 UINode
export function convertRawNode(raw: RawUINode): UINode {
  const props = raw.properties || {}

  // 解析 bounds 字符串 "[0,0][100,100]" 为数组
  let boundsArray: [number, number, number, number] | undefined
  if (raw.rect) {
    boundsArray = [
      raw.rect.x,
      raw.rect.y,
      raw.rect.x + raw.rect.width,
      raw.rect.y + raw.rect.height,
    ]
  } else if (props.bounds) {
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
    text: props.text || undefined,
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
    children: raw.children?.map(convertRawNode),
  }
}

// 从原始 API 响应转换为 HierarchyData
export function convertRawHierarchy(raw: RawUINode): HierarchyData {
  // 从根节点获取屏幕尺寸（找最大的 right 和 bottom 值）
  let width = 0
  let height = 0

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

  // 获取 rotation
  const rotation = raw.properties?.rotation ? parseInt(raw.properties.rotation) : 0

  return {
    width,
    height,
    rotation,
    nodes: raw.children?.map(convertRawNode) || [],
  }
}
