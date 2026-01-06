import type { UINode } from '@/api/types'

/**
 * 生成节点的XPath
 * 策略：
 * 1. 如果节点有唯一标识符（resource-id），直接使用短路径 //*[@resource-id="..."]
 * 2. 否则构建从根到节点的完整路径
 *
 * @param node 目标节点
 * @param allNodes 所有节点的扁平列表
 * @returns XPath字符串
 */
export function generateXPath(node: UINode, allNodes: UINode[]): string {
  // Android: resource-id 检查唯一性后使用短路径
  if (node.resource_id) {
    const count = allNodes.filter(n => n.resource_id === node.resource_id).length
    if (count === 1) {
      return `//*[@resource-id="${node.resource_id}"]`
    }
    // resource-id 不唯一，继续使用完整路径
  }

  // iOS: name (accessibility identifier) 检查唯一性后使用短路径
  const isIOS = node.class_name?.startsWith('XCUIElementType')
  if (isIOS && node.name && node.name.trim()) {
    const count = allNodes.filter(n => n.name === node.name).length
    if (count === 1) {
      return `//${node.class_name}[@name="${node.name}"]`
    }
    // name 不唯一，继续使用完整路径
  }

  // 构建完整路径
  const path: string[] = []
  let current: UINode | undefined = node

  while (current) {
    const segment = generateSegment(current, allNodes)
    path.unshift(segment)
    current = findParent(current, allNodes)
  }

  return '/' + path.join('/')
}

/**
 * 生成单个节点的XPath段
 * 优先级：
 * - Android: resource-id > content-desc > text > class + index
 * - iOS: name > label > class + index
 */
function generateSegment(node: UINode, allNodes: UINode[]): string {
  const className = node.class_name || '*'
  const isIOS = className.startsWith('XCUIElementType')

  // Android: 优先使用 resource-id
  if (node.resource_id) {
    return `*[@resource-id="${node.resource_id}"]`
  }

  // Android: 使用 content-desc（无障碍描述，常用于图标按钮）
  if (!isIOS && node.content_desc && node.content_desc.trim()) {
    return `${className}[@content-desc="${node.content_desc}"]`
  }

  // iOS: 优先使用 name（accessibility identifier）
  if (isIOS && node.name && node.name.trim() && node.name !== className) {
    return `${className}[@name="${node.name}"]`
  }

  // 使用 label（iOS）或 text（Android）
  if (node.label && node.label.trim()) {
    return `${className}[@label="${node.label}"]`
  }
  if (node.text && node.text.trim()) {
    // Android: 使用 class + text 组合，更精确
    if (!isIOS) {
      return `${className}[@text="${node.text}"]`
    }
    return `*[@text="${node.text}"]`
  }

  // 最后使用 class + index
  const parent = findParent(node, allNodes)

  if (parent) {
    // 计算在同类兄弟节点中的索引
    const siblings = parent.children?.filter(child => child.class_name === node.class_name) || []
    if (siblings.length > 1) {
      const index = siblings.findIndex(child => child.key === node.key)
      return `${className}[${index + 1}]`
    }
  }

  return className
}

/**
 * 查找节点的父节点
 */
function findParent(node: UINode, allNodes: UINode[]): UINode | undefined {
  for (const candidate of allNodes) {
    if (candidate.children?.some(child => child.key === node.key)) {
      return candidate
    }
  }
  return undefined
}

/**
 * 扁平化节点树
 */
export function flattenNodes(nodes: UINode[]): UINode[] {
  const result: UINode[] = []

  function traverse(node: UINode) {
    result.push(node)
    node.children?.forEach(traverse)
  }

  nodes.forEach(traverse)
  return result
}
