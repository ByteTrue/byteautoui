import type { UINode } from '@/api/types'

/**
 * 生成节点的XPath
 * @param node 目标节点
 * @param allNodes 所有节点的扁平列表
 * @returns XPath字符串
 */
export function generateXPath(node: UINode, allNodes: UINode[]): string {
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
 * 优先级：resource-id > text > class + index
 */
function generateSegment(node: UINode, allNodes: UINode[]): string {
  // 优先使用resource-id（唯一标识）
  if (node.resource_id) {
    return `*[@resource-id="${node.resource_id}"]`
  }

  // 其次使用text（如果文本唯一）
  if (node.text && node.text.trim()) {
    return `*[@text="${node.text}"]`
  }

  // 最后使用class + index
  const className = node.class_name || '*'
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
