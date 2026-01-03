import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Platform, UINode, HierarchyData } from '@/api/types'
import { getHierarchy, getScreenshotUrl } from '@/api'
import { generateXPath, flattenNodes } from '@/utils/xpath'

export const useDeviceStore = defineStore('device', () => {
  // 状态
  const platform = ref<Platform>('android')
  const serial = ref('')
  const hierarchy = ref<HierarchyData | null>(null)
  const selectedNode = ref<UINode | null>(null)
  const hoveredNode = ref<UINode | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const screenshotId = ref(0)

  // 计算属性
  const screenSize = computed(() => {
    if (!hierarchy.value) return { width: 0, height: 0 }
    return { width: hierarchy.value.width, height: hierarchy.value.height }
  })

  const screenshotUrl = computed(() => {
    if (!serial.value) return ''
    // screenshotId 只用于触发重新计算，实际 URL 用 timestamp
    void screenshotId.value
    return getScreenshotUrl(platform.value, serial.value)
  })

  // 方法
  function setDevice(p: Platform, s: string) {
    platform.value = p
    serial.value = s
    hierarchy.value = null
    selectedNode.value = null
    error.value = null
  }

  async function refreshHierarchy() {
    if (!serial.value) return
    loading.value = true
    error.value = null
    try {
      hierarchy.value = await getHierarchy(platform.value, serial.value)
      screenshotId.value++
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  function selectNode(node: UINode | null) {
    if (node && hierarchy.value) {
      // 生成XPath
      const allNodes = flattenNodes(hierarchy.value.nodes)
      node.xpath = generateXPath(node, allNodes)
    }
    selectedNode.value = node
  }

  function refreshScreenshot() {
    screenshotId.value++
  }

  function setHoveredNode(node: UINode | null) {
    hoveredNode.value = node
  }

  // Remote模式 - 从WebSocket更新数据
  function updateFromRemote(data: { hierarchy?: HierarchyData; screenshot?: boolean }) {
    if (data.hierarchy) {
      hierarchy.value = data.hierarchy
    }
    if (data.screenshot) {
      // 触发screenshot URL重新计算
      screenshotId.value++
    }
  }

  return {
    platform,
    serial,
    hierarchy,
    selectedNode,
    hoveredNode,
    loading,
    error,
    screenSize,
    screenshotUrl,
    setDevice,
    refreshHierarchy,
    selectNode,
    refreshScreenshot,
    setHoveredNode,
    updateFromRemote,
  }
})
