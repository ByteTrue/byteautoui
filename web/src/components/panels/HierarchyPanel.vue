<template>
  <div class="hierarchy-panel">
    <!-- Search Bar -->
    <div class="hierarchy-search-bar">
      <n-select
        v-model:value="searchType"
        :options="searchTypeOptions"
        size="small"
        style="width: 160px; flex-shrink: 0"
      />
      <n-input
        v-model:value="hierarchySearch"
        :placeholder="t.searchPlaceholder"
        clearable
        @keydown.enter="searchInHierarchy"
        style="flex: 1"
      >
        <template #suffix>
          <n-button
            text
            @click="searchInHierarchy"
            :loading="searchLoading"
            :disabled="!hierarchySearch.trim()"
          >
            <template #icon>
              <n-icon><search-outline /></n-icon>
            </template>
          </n-button>
        </template>
      </n-input>
    </div>

    <!-- Search Results Info -->
    <div v-if="searchResults.length > 0" class="search-results-info">
      <span>{{ i18nStore.format(t.foundResults, { count: searchResults.length }) }}</span>
      <n-button text size="small" @click="clearSearch">
        <template #icon>
          <n-icon><close-outline /></n-icon>
        </template>
        {{ i18nStore.t.common.clear }}
      </n-button>
    </div>

    <!-- Search Results List -->
    <div v-if="searchResults.length > 0" class="search-results-list">
      <div
        v-for="(result, index) in searchResults"
        :key="index"
        class="search-result-item"
        @click="selectSearchResult(result)"
      >
        <div class="result-index">{{ index + 1 }}</div>
        <div class="result-content">
          <div class="result-primary">
            {{ result.text || result.resource_id || result.class_name || `${t.noElement} ${index + 1}` }}
          </div>
          <div class="result-secondary">
            <span v-if="result.resource_id" class="result-tag">{{ result.resource_id }}</span>
            <span v-if="result.class_name" class="result-tag">{{ result.class_name }}</span>
          </div>
        </div>
        <n-icon size="16" color="var(--md-primary)">
          <arrow-forward-outline />
        </n-icon>
      </div>
    </div>

    <!-- Tree View -->
    <n-tree
      v-if="treeData.length > 0"
      :data="treeData"
      :selected-keys="selectedKeys"
      :expanded-keys="expandedKeys"
      :node-props="nodeProps"
      :render-label="renderTreeLabel"
      selectable
      block-line
      @update:selected-keys="handleNodeSelect"
      @update:expanded-keys="handleExpandChange"
    />
    <n-empty v-else :description="t.noElement" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, h } from 'vue'
import { useMessage, NIcon, type TreeOption } from 'naive-ui'
import { SearchOutline, CloseOutline, ArrowForwardOutline, FolderOutline, DocumentOutline } from '@vicons/ionicons5'
import { useDeviceStore } from '@/stores/device'
import { useI18nStore } from '@/stores/i18n'
import { sendCommand } from '@/api'
import { convertRawNode, type RawUINode, type UINode, type Platform } from '@/api/types'

const props = defineProps<{
  platform: Platform
  serial: string
}>()

const message = useMessage()
const store = useDeviceStore()
const i18nStore = useI18nStore()

// 国际化文本
const t = computed(() => i18nStore.t.hierarchy)

// Hierarchy Search State
const hierarchySearch = ref('')
const searchResults = ref<UINode[]>([])
const searchLoading = ref(false)
const searchType = ref<'text' | 'xpath' | 'id' | 'className'>('text')

// 搜索类型选项
const searchTypeOptions = computed(() => [
  { label: t.value.searchType.text, value: 'text' },
  { label: t.value.searchType.xpath, value: 'xpath' },
  { label: t.value.searchType.id, value: 'id' },
  { label: t.value.searchType.className, value: 'className' },
])

// Tree State
const nodeKeyMap = ref<Map<string, UINode>>(new Map())
const selectedKeys = ref<string[]>([])
const expandedKeys = ref<string[]>([])

// Convert UI nodes to tree options
function convertToTreeOptions(nodes: UINode[], parentKey = ''): TreeOption[] {
  return nodes.map((node, index) => {
    const key = parentKey ? `${parentKey}-${index}` : `${index}`

    // 存储节点映射
    nodeKeyMap.value.set(key, node)

    const hasChildren = node.children && node.children.length > 0

    return {
      key,
      label: `${index} ${node.class_name || 'Node'}`, // 暂存基础信息，实际渲染用renderLabel
      prefix: () => h(NIcon, null, {
        default: () => h(hasChildren ? FolderOutline : DocumentOutline)
      }),
      children: hasChildren ? convertToTreeOptions(node.children!, key) : undefined,
      isLeaf: !hasChildren,
      raw: node,
    }
  })
}

// 自定义渲染树节点标签（实现颜色高亮）
function renderTreeLabel({ option }: { option: TreeOption }) {
  const node = option.raw as UINode
  const index = (option.label || '').split(' ')[0] // 提取序号
  const className = node.class_name || 'Node'

  // 构建子元素 - 使用class而非inline style，支持主题切换
  const elements = [
    h('span', { class: 'tree-node-index' }, `${index} `),
    h('span', { class: 'tree-node-class' }, className),
  ]

  // 添加 id 和/或 text（蓝色高亮）
  if (node.resource_id) {
    const shortId = node.resource_id.split('/').pop() || node.resource_id
    elements.push(h('span', { class: 'tree-node-highlight' }, ` id=${shortId}`))
  }
  if (node.text) {
    elements.push(h('span', { class: 'tree-node-highlight' }, ` text=${node.text}`))
  }

  return h('span', {}, elements)
}

const treeData = computed<TreeOption[]>(() => {
  if (!store.hierarchy?.nodes) return []
  nodeKeyMap.value.clear()
  return convertToTreeOptions(store.hierarchy.nodes)
})

// Hierarchy Search Functions
async function searchInHierarchy() {
  if (!hierarchySearch.value.trim()) {
    message.warning(t.value.searchPlaceholder)
    return
  }

  searchLoading.value = true
  try {
    // 先刷新 hierarchy，确保搜索结果和当前树同步
    await store.refreshHierarchy()

    const searchValue = hierarchySearch.value.trim()

    const result = await sendCommand(props.platform, props.serial, 'findElements', {
      by: searchType.value,
      value: searchValue
    })

    // 后端返回格式：{ count: number, value: RawUINode[] }
    if (result && typeof result === 'object' && 'value' in result) {
      const responseData = result as { count: number; value: RawUINode[] }
      // 转换 RawUINode 为 UINode
      searchResults.value = responseData.value.map(convertRawNode)

      if (responseData.count === 0) {
        message.warning(t.value.noResults)
      } else if (responseData.count === 1) {
        // 只有一个结果，自动选中
        selectSearchResult(searchResults.value[0]!)
      } else {
        message.success(i18nStore.format(t.value.foundResults, { count: responseData.count }))
      }
    } else if (Array.isArray(result)) {
      // 转换 RawUINode 为 UINode
      searchResults.value = (result as RawUINode[]).map(convertRawNode)
      if (result.length === 1) {
        selectSearchResult(searchResults.value[0]!)
      } else {
        message.success(i18nStore.format(t.value.foundResults, { count: result.length }))
      }
    } else {
      searchResults.value = []
      message.warning(t.value.noResults)
    }
  } catch (error) {
    message.error(`${t.value.searchPlaceholder}: ${error instanceof Error ? error.message : String(error)}`)
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

// 通过 bounds 查找树中的节点（用于搜索结果匹配）
function findNodeByBounds(bounds: number[] | undefined, options: TreeOption[], parentKey = ''): string | null {
  if (!bounds || bounds.length !== 4) return null

  for (let i = 0; i < options.length; i++) {
    const option = options[i]
    const key = parentKey ? `${parentKey}-${i}` : `${i}`

    // 比较 bounds 是否完全相同
    const rawNode = option?.raw as UINode | undefined
    if (rawNode?.bounds) {
      const nodeBounds = rawNode.bounds
      if (
        nodeBounds[0] === bounds[0] &&
        nodeBounds[1] === bounds[1] &&
        nodeBounds[2] === bounds[2] &&
        nodeBounds[3] === bounds[3]
      ) {
        return key
      }
    }

    // 递归查找子节点
    if (option && option.children) {
      const foundKey = findNodeByBounds(bounds, option.children, key)
      if (foundKey) return foundKey
    }
  }
  return null
}

// 获取节点的所有父节点键（用于展开）
function getParentKeys(nodeKey: string): string[] {
  const parts = nodeKey.split('-')
  const parentKeys: string[] = []

  for (let i = 1; i < parts.length; i++) {
    parentKeys.push(parts.slice(0, i).join('-'))
  }

  return parentKeys
}

async function selectSearchResult(node: UINode) {
  // 等待 DOM 更新完成
  await nextTick()

  // 通过 bounds 在树中查找对应的节点
  const nodeKey = findNodeByBounds(node.bounds, treeData.value)

  if (nodeKey) {
    // 找到了，展开父节点并选中
    const parentKeys = getParentKeys(nodeKey)
    const newExpandedKeys = new Set([...expandedKeys.value, ...parentKeys])
    expandedKeys.value = Array.from(newExpandedKeys)

    // 选中节点
    selectedKeys.value = [nodeKey]

    // 同时更新 store 中的选中节点（用于在设备屏幕上高亮）
    const treeNode = nodeKeyMap.value.get(nodeKey)
    if (treeNode) {
      store.selectNode(treeNode)
    }

    message.success('已选中并定位到元素')
  } else {
    // 没找到对应的节点，可能是树结构和搜索结果不同步
    // 仍然更新 store 以便在屏幕上高亮
    store.selectNode(node)
    message.warning('已选中元素，但无法在树中定位（可能需要刷新）')
  }
}

function clearSearch() {
  hierarchySearch.value = ''
  searchResults.value = []
}

// Handle node selection
function handleNodeSelect(_keys: string[], options: Array<TreeOption | null>) {
  const firstOption = options[0]
  if (firstOption && firstOption.raw) {
    const node = firstOption.raw as UINode
    store.selectNode(node)
  }
}

// Handle expand change
function handleExpandChange(keys: string[]) {
  expandedKeys.value = keys
}

// Node props for tree (handle double click)
const nodeProps = ({ option }: { option: TreeOption }) => {
  return {
    onDblclick() {
      // Only toggle expand/collapse for non-leaf nodes
      if (!option.isLeaf) {
        const key = option.key as string
        if (expandedKeys.value.includes(key)) {
          expandedKeys.value = expandedKeys.value.filter(k => k !== key)
        } else {
          expandedKeys.value = [...expandedKeys.value, key]
        }
      }
    }
  }
}

// 同步 store.selectedNode 到树的选中状态
watch(
  () => store.selectedNode,
  async (node) => {
    if (!node) {
      selectedKeys.value = []
      return
    }

    // 等待树数据更新
    await nextTick()

    // 通过 bounds 在树中查找对应的节点
    const nodeKey = findNodeByBounds(node.bounds, treeData.value)

    if (nodeKey) {
      // 找到了，展开父节点并选中
      const parentKeys = getParentKeys(nodeKey)
      const newExpandedKeys = new Set([...expandedKeys.value, ...parentKeys])
      expandedKeys.value = Array.from(newExpandedKeys)

      // 选中节点
      selectedKeys.value = [nodeKey]
    }
  },
  { deep: true }
)
</script>

<style scoped>
.hierarchy-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--md-space-md);
  gap: var(--md-space-sm);
}

.hierarchy-search-bar {
  display: flex;
  gap: var(--md-space-xs);
  align-items: center;
}

.search-results-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--md-space-xs) var(--md-space-sm);
  background: var(--md-info-container);
  border-radius: var(--md-shape-corner-small);
  font-size: var(--md-font-size-sm);
  color: var(--md-text-secondary);
}

.search-results-list {
  border: 1px solid var(--md-outline);
  border-radius: var(--md-shape-corner-medium);
  max-height: 300px;
  overflow-y: auto;
  background: var(--md-surface);
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: var(--md-space-sm);
  padding: 10px var(--md-space-sm);
  border-bottom: 1px solid var(--md-outline-variant);
  cursor: pointer;
  transition: background var(--md-duration-short) var(--md-easing-standard);
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background: var(--md-surface-variant);
}

.result-index {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--md-primary);
  color: var(--md-on-primary);
  border-radius: 50%;
  font-size: var(--md-font-size-xs);
  font-weight: var(--md-font-weight-medium);
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-primary {
  font-size: var(--md-font-size-md);
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-secondary {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.result-tag {
  font-size: var(--md-font-size-xs);
  color: var(--md-text-secondary);
  background: var(--md-surface-container);
  padding: 2px var(--md-space-xs);
  border-radius: var(--md-shape-corner-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.hierarchy-panel :deep(.n-tree) {
  flex: 1;
  overflow: auto;
}

/* 树节点文本样式 - 支持主题切换 */
.hierarchy-panel :deep(.tree-node-index) {
  color: var(--md-text-tertiary);
}

.hierarchy-panel :deep(.tree-node-class) {
  color: var(--md-text-primary);
}

.hierarchy-panel :deep(.tree-node-highlight) {
  color: #63a4ff; /* 浅色模式 */
}

/* 深色模式下使用更亮的蓝色 */
[data-theme="dark"] .hierarchy-panel :deep(.tree-node-highlight) {
  color: #91c7ff;
}

/* 树节点选中背景色使用主题蓝色 */
.hierarchy-panel :deep(.n-tree-node--selected) {
  background-color: rgba(32, 128, 240, 0.15) !important;
}

.hierarchy-panel :deep(.n-tree-node--selected:hover) {
  background-color: rgba(32, 128, 240, 0.2) !important;
}
</style>
