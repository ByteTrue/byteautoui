<template>
  <div class="package-panel">
    <div class="package-content">
      <n-space vertical :size="16">
        <!-- Install Section -->
        <div class="install-section">
          <h4>{{ t.currentApp }}</h4>
          <n-space :size="8">
            <n-input
              v-model:value="installFile"
              placeholder="APK file path"
              style="flex: 1"
            />
            <n-button
              type="primary"
              @click="installPackage"
              :disabled="!installFile.trim()"
            >
              Install
            </n-button>
          </n-space>
        </div>

        <!-- Package List Section -->
        <div class="package-list-section">
          <n-space justify="space-between" align="center" style="margin-bottom: 12px">
            <h4>{{ t.installedApps }} ({{ filteredPackages.length }})</h4>
            <n-space :size="8">
              <n-input
                v-model:value="packageFilter"
                :placeholder="i18nStore.t.common.search + '...'"
                clearable
                style="width: 200px"
              />
              <n-button @click="loadPackages" :loading="packagesLoading">
                <template #icon>
                  <n-icon><refresh-outline /></n-icon>
                </template>
                {{ i18nStore.t.common.refresh }}
              </n-button>
            </n-space>
          </n-space>

          <div v-if="packagesLoading" class="loading-state">
            <n-spin size="large" />
            <div class="loading-text">{{ i18nStore.t.common.loading }}</div>
          </div>

          <div v-else-if="filteredPackages.length === 0" class="empty-state">
            <n-empty :description="t.noApps" />
            <div class="empty-hint">
              <p>点击"{{ i18nStore.t.common.refresh }}"按钮加载已安装的应用列表</p>
              <p class="empty-hint-small">如果一直无法加载，请检查设备连接状态</p>
            </div>
          </div>

          <div v-else class="package-list">
            <div
              v-for="pkg in filteredPackages"
              :key="pkg.package"
              class="package-item"
            >
              <div class="package-info">
                <div class="package-name">{{ pkg.name || '未知应用' }}</div>
                <div class="package-id">{{ pkg.package || '无包名' }}</div>
                <div v-if="pkg.version" class="package-version">v{{ pkg.version }}</div>
              </div>
              <n-space :size="8">
                <n-button size="small" @click="launchPackage(pkg.package)">
                  {{ t.launch }}
                </n-button>
                <n-button size="small" @click="backupPackage(pkg.package)">
                  <template #icon>
                    <n-icon><download-outline /></n-icon>
                  </template>
                  Backup
                </n-button>
                <n-button size="small" @click="clearPackageData(pkg.package)">
                  {{ t.clear }}
                </n-button>
                <n-button
                  size="small"
                  type="error"
                  @click="uninstallPackage(pkg.package)"
                >
                  {{ t.uninstall }}
                </n-button>
              </n-space>
            </div>
          </div>
        </div>
      </n-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { RefreshOutline, DownloadOutline } from '@vicons/ionicons5'
import { sendCommand } from '@/api'
import { useI18nStore } from '@/stores/i18n'
import type { Platform } from '@/api/types'

const props = defineProps<{
  platform: Platform
  serial: string
}>()

const message = useMessage()
const i18nStore = useI18nStore()

// 国际化文本
const t = computed(() => i18nStore.t.package)

interface AppPackage {
  name: string
  package: string
  version?: string
}

const packages = ref<AppPackage[]>([])
const packagesLoading = ref(false)
const packageFilter = ref('')
const installFile = ref('')

const filteredPackages = computed(() => {
  if (!packageFilter.value) return packages.value
  const filter = packageFilter.value.toLowerCase()
  return packages.value.filter(pkg =>
    pkg.name.toLowerCase().includes(filter) ||
    pkg.package.toLowerCase().includes(filter)
  )
})

async function loadPackages() {
  packagesLoading.value = true
  try {
    const result = await sendCommand(props.platform, props.serial, 'appList', {})

    if (Array.isArray(result)) {
      packages.value = result.map((pkg: any) => {
        const packageName = pkg.package || pkg.packageName || pkg.pkg || ''
        const appName = pkg.name || pkg.label || pkg.appName || packageName
        return {
          name: appName,
          package: packageName,
          version: pkg.version || pkg.versionName || pkg.ver || '',
        }
      }).filter(pkg => pkg.package)

      message.success(`已加载 ${packages.value.length} 个应用`)
    } else {
      message.error('应用列表格式错误')
    }
  } catch (error) {
    message.error(`加载应用列表失败: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    packagesLoading.value = false
  }
}

async function launchPackage(pkg: string) {
  try {
    await sendCommand(props.platform, props.serial, 'appLaunch', { package: pkg })
    message.success(t.value.appLaunched)
  } catch (error) {
    message.error(`${t.value.launch} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function uninstallPackage(pkg: string) {
  try {
    await sendCommand(props.platform, props.serial, 'uninstallApp', { package: pkg })
    message.success(t.value.appUninstalled)
    await loadPackages()
  } catch (error) {
    message.error(`${t.value.uninstall} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function clearPackageData(pkg: string) {
  try {
    await sendCommand(props.platform, props.serial, 'clearApp', { package: pkg })
    message.success(t.value.dataCleared)
  } catch (error) {
    message.error(`${t.value.clear} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function backupPackage(pkg: string) {
  try {
    const baseUrl = window.location.origin
    const backupUrl = `${baseUrl}/api/${props.platform}/${props.serial}/backupApp?package=${encodeURIComponent(pkg)}`

    const a = document.createElement('a')
    a.href = backupUrl
    a.download = `${pkg}.apk`
    a.click()

    message.success(`Downloading: ${pkg}.apk`)
  } catch (error) {
    message.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function installPackage() {
  if (!installFile.value.trim()) return

  try {
    await sendCommand(props.platform, props.serial, 'installApp', { path: installFile.value })
    message.success(`Installed: ${installFile.value}`)
    installFile.value = ''
    await loadPackages()
  } catch (error) {
    message.error(`Install failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
</script>

<style scoped>
.package-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 400px;
}

.package-content {
  flex: 1;
  overflow: auto;
  padding: var(--md-space-md);
}

.install-section h4,
.package-list-section h4 {
  margin: 0 0 var(--md-space-xs) 0;
  font-size: var(--md-font-size-md);
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
}

.loading-state,
.empty-state {
  text-align: center;
  padding: var(--md-space-xxl);
}

.loading-text {
  margin-top: var(--md-space-md);
  color: var(--md-text-secondary);
}

.empty-hint {
  margin-top: var(--md-space-md);
  color: var(--md-text-secondary);
}

.empty-hint-small {
  font-size: var(--md-font-size-xs);
  margin-top: var(--md-space-xs);
}

.package-list {
  border: 1px solid var(--md-outline);
  border-radius: var(--md-shape-corner-medium);
  max-height: 500px;
  overflow-y: auto;
  background: var(--md-surface);
}

.package-item {
  padding: var(--md-space-sm) var(--md-space-md);
  border-bottom: 1px solid var(--md-outline-variant);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--md-space-md);
  transition: background var(--md-duration-short) var(--md-easing-standard);
}

.package-item:last-child {
  border-bottom: none;
}

.package-item:hover {
  background: var(--md-surface-variant);
}

.package-info {
  flex: 1;
  min-width: 0;
}

.package-name {
  font-weight: var(--md-font-weight-medium);
  color: var(--md-text-primary);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-id {
  font-size: var(--md-font-size-xs);
  color: var(--md-text-secondary);
  font-family: var(--md-font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.package-version {
  font-size: var(--md-font-size-xs);
  color: var(--md-text-tertiary);
  margin-top: 2px;
}
</style>
