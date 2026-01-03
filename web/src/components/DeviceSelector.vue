<script setup lang="ts">
import { ref, watch, markRaw } from 'vue'
import {
  NModal,
  NTabs,
  NTabPane,
  NSpace,
  NIcon,
  NSpin,
  NTag,
} from 'naive-ui'
import {
  LogoAndroid,
  LogoApple,
  SunnyOutline,
} from '@vicons/ionicons5'
import type { DeviceInfo, Platform } from '@/api/types'
import { getDeviceList } from '@/api'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  select: [platform: Platform, serial: string]
}>()

const activeTab = ref('android')

interface DeviceGroup {
  platform: Platform
  label: string
  icon: typeof LogoAndroid
  devices: DeviceInfo[]
  loading: boolean
}

const deviceGroups = ref<DeviceGroup[]>([
  { platform: 'android', label: 'Android', icon: markRaw(LogoAndroid), devices: [], loading: false },
  { platform: 'ios', label: 'iOS', icon: markRaw(LogoApple), devices: [], loading: false },
  { platform: 'harmony', label: 'Harmony', icon: markRaw(SunnyOutline), devices: [], loading: false },
])

async function loadDevices(platform: Platform) {
  const group = deviceGroups.value.find(g => g.platform === platform)
  if (!group) return

  group.loading = true
  try {
    group.devices = await getDeviceList(platform)
  } catch {
    group.devices = []
  } finally {
    group.loading = false
  }
}

function selectDevice(platform: Platform, serial: string) {
  emit('select', platform, serial)
  emit('update:show', false)
}

function handleTabChange(tab: string) {
  activeTab.value = tab
  loadDevices(tab as Platform)
}

// Load devices when modal opens
watch(() => props.show, (show) => {
  if (show) {
    // Load all platforms
    loadDevices('android')
    loadDevices('ios')
    loadDevices('harmony')
  }
})
</script>

<template>
  <n-modal
    :show="show"
    @update:show="(val) => emit('update:show', val)"
    preset="card"
    size="huge"
    :bordered="false"
    :segmented="{ content: true }"
    style="max-width: 900px"
  >
    <!-- 标题 -->
    <template #header>
      <span class="modal-title">选择设备</span>
    </template>

    <n-tabs
      v-model:value="activeTab"
      type="line"
      @update:value="handleTabChange"
    >
      <n-tab-pane
        v-for="group in deviceGroups"
        :key="group.platform"
        :name="group.platform"
      >
        <template #tab>
          <n-space align="center" :size="6">
            <n-icon size="18">
              <component :is="group.icon" />
            </n-icon>
            <span>{{ group.label }}</span>
          </n-space>
        </template>

        <!-- Device List -->
        <div class="device-content">
          <n-spin :show="group.loading">
            <div v-if="group.devices.length > 0" class="device-grid">
              <div
                v-for="device in group.devices"
                :key="device.serial"
                class="device-card"
                @click="selectDevice(group.platform, device.serial)"
              >
                <div class="device-icon">
                  <n-icon size="32" color="var(--md-primary)">
                    <component :is="group.icon" />
                  </n-icon>
                </div>
                <div class="device-info">
                  <div class="device-name">
                    {{ device.name || device.model || device.serial }}
                  </div>
                  <div class="device-serial">
                    {{ device.serial }}
                  </div>
                </div>
                <n-tag
                  :type="device.enabled !== false ? 'success' : 'warning'"
                  size="small"
                  round
                  class="device-status"
                >
                  {{ device.status || 'device' }}
                </n-tag>
              </div>
            </div>

            <div v-else class="empty-state">
              <n-icon size="48" color="var(--md-text-tertiary)">
                <component :is="group.icon" />
              </n-icon>
              <h3 class="empty-title">No {{ group.label }} devices found</h3>
              <p class="empty-desc">
                Please enable developer mode and connect your device via USB
              </p>
            </div>
          </n-spin>
        </div>
      </n-tab-pane>
    </n-tabs>
  </n-modal>
</template>

<style scoped>
.modal-title {
  font-size: var(--md-font-size-lg);
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
}

.device-content {
  min-height: 200px;
  padding: var(--md-space-sm) 0;
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--md-space-md);
}

.device-card {
  background: var(--md-surface);
  border: 1px solid var(--md-outline);
  border-radius: var(--md-shape-corner-medium);
  padding: var(--md-space-md);
  display: flex;
  align-items: center;
  gap: var(--md-space-md);
  cursor: pointer;
  transition: all var(--md-duration-short) var(--md-easing-standard);
}

.device-card:hover {
  border-color: var(--md-primary);
  box-shadow: var(--md-elevation-2);
  transform: translateY(-2px);
}

.device-icon {
  width: 48px;
  height: 48px;
  background: var(--md-primary-container);
  border-radius: var(--md-shape-corner-medium);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-name {
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
  font-size: var(--md-font-size-md);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-serial {
  font-size: var(--md-font-size-xs);
  color: var(--md-text-tertiary);
  font-family: var(--md-font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-status {
  flex-shrink: 0;
}

.empty-state {
  text-align: center;
  padding: var(--md-space-xxl) var(--md-space-lg);
}

.empty-title {
  margin: var(--md-space-md) 0 var(--md-space-xs);
  font-size: var(--md-font-size-lg);
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
}

.empty-desc {
  color: var(--md-text-secondary);
  font-size: var(--md-font-size-sm);
  line-height: var(--md-line-height-relaxed);
}
</style>
