# iOS WDA 配置管理

## 概述

ByteAutoUI 支持自动启动 WebDriverAgent (WDA) 并记忆每个设备的配置，无需每次手动指定。

## 快速开始

### 1. 首次使用（手动指定 WDA bundle ID）

```python
from byteautoui.provider import IOSProvider

# 方式1: 通过 IOSDriver 直接指定
from byteautoui.driver.ios import IOSDriver
driver = IOSDriver(
    serial="<your-device-udid>",
    wda_bundle_id="com.yourcompany.WebDriverAgentRunner.xctrunner"  # 首次指定
)

# 配置会自动保存到 ~/.byteautoui/ios_config.json
# 下次使用时自动读取，无需再次指定
```

### 2. 后续使用（自动读取配置）

```python
# 直接使用，会自动从配置读取 bundle ID
driver = IOSDriver(serial="<your-device-udid>")
```

### 3. 使用 CLI 管理配置

```bash
# 列出所有 iOS 设备
byteautoui ios-config list-devices

# 设置设备的 WDA bundle ID
byteautoui ios-config set-wda-bundle-id <UDID> com.facebook.WebDriverAgentRunner.xctrunner

# 查看设备配置
byteautoui ios-config show-config <UDID>

# 查看所有设备配置
byteautoui ios-config show-all

# 清除设备配置
byteautoui ios-config clear <UDID>
```

## 配置文件

配置自动保存在 `~/.byteautoui/ios_config.json`:

```json
{
  "00008030-000A1234567890AB": {
    "wda_bundle_id": "com.facebook.WebDriverAgentRunner.xctrunner",
    "wda_port": 8100
  },
  "00008030-000B9876543210CD": {
    "wda_bundle_id": "com.mycompany.WebDriverAgentRunner.xctrunner",
    "wda_port": 8100
  }
}
```

## 完整 API 参考

### IOSDriver 参数

```python
IOSDriver(
    serial: str,                        # 设备 UDID (必选)
    auto_start_wda: bool = True,        # 是否自动启动 WDA (默认True)
    wda_bundle_id: Optional[str] = None,  # WDA bundle ID (可选，会自动记忆)
    wda_port: Optional[int] = None      # WDA 端口 (默认8100)
)
```

### IOSProvider 参数

```python
IOSProvider(
    wda_bundle_id: Optional[str] = None,  # 全局默认 bundle ID
    wda_port: Optional[int] = None        # 全局默认端口
)

# 使用示例
provider = IOSProvider(wda_bundle_id="com.mycompany.WebDriverAgentRunner.xctrunner")
driver = provider.get_device_driver(serial)
```

## 常见 WDA Bundle ID

- 默认: `com.facebook.WebDriverAgentRunner.xctrunner`
- Appium 构建: `com.appium.WebDriverAgentRunner.xctrunner`
- 自定义构建: `com.yourcompany.WebDriverAgentRunner.xctrunner`

## 工作原理

1. **首次指定**: 当你第一次为某个设备指定 `wda_bundle_id` 时，系统会自动保存到配置文件
2. **自动记忆**: 下次使用同一设备时，如果没有明确指定 `wda_bundle_id`，会自动从配置读取
3. **优先级**: 明确指定的参数 > 设备配置 > 全局默认值

## 注意事项

- 配置文件是纯文本 JSON，可以手动编辑
- 每个设备的配置独立存储
- 修改配置后立即生效，无需重启
- 配置文件位于用户目录，不会被项目更新覆盖
