import type { UINode } from '@/api/types'

/**
 * 生成节点的XPath
 * 策略（优先使用稳定的相对路径，避免UI层级变化导致失效）：
 * - iOS: class+label（优先）→ 绝对路径（兜底）
 * - Android: resource-id（优先）→ class+text（次选）→ 绝对路径（兜底）
 *
 * @param node 目标节点
 * @param allNodes 所有节点的扁平列表
 * @returns XPath字符串
 */
export function generateXPath(node: UINode, allNodes: UINode[]): string {
  const isIOS = node.class_name?.startsWith('XCUIElementType')

  if (isIOS) {
    // iOS: 优先使用 class + label（如果 label+class 组合唯一）
    if (node.label && node.label.trim() && node.class_name) {
      const count = allNodes.filter(n =>
        n.label === node.label &&
        n.class_name === node.class_name
      ).length
      if (count === 1) {
        return `//${node.class_name}[@label="${node.label}"]`
      }
    }
  } else {
    // Android: 优先使用 resource-id（如果唯一）
    if (node.resource_id) {
      const count = allNodes.filter(n => n.resource_id === node.resource_id).length
      if (count === 1) {
        return `//*[@resource-id="${node.resource_id}"]`
      }
    }

    // Android: 其次使用 class + text（如果 text+class 组合唯一）
    if (node.text && node.text.trim() && node.class_name) {
      const count = allNodes.filter(n =>
        n.text === node.text &&
        n.class_name === node.class_name
      ).length
      if (count === 1) {
        return `//${node.class_name}[@text="${node.text}"]`
      }
    }
  }

  // 最后兜底：构建完整绝对路径
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
 * - Android: resource-id > text > class + index
 * - iOS: label > class + index
 */
function generateSegment(node: UINode, allNodes: UINode[]): string {
  const className = node.class_name || '*'
  const isIOS = className.startsWith('XCUIElementType')

  if (isIOS) {
    // iOS: 优先使用 label
    if (node.label && node.label.trim()) {
      return `${className}[@label="${node.label}"]`
    }
  } else {
    // Android: 优先使用 resource-id（带上 class_name 提高精确度）
    if (node.resource_id) {
      return `${className}[@resource-id="${node.resource_id}"]`
    }

    // Android: 使用 text
    if (node.text && node.text.trim()) {
      return `${className}[@text="${node.text}"]`
    }
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
