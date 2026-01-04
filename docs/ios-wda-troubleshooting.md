# iOS WDA 启动失败排查指南

## 你遇到的错误

```
ERROR WDA thread error: InvalidService
RuntimeError: WDA failed to start within 30 seconds on port 8100
```

## 原因分析

`InvalidService` 错误说明 **WDA未安装到设备**或者**bundle ID不正确**。

---

## 解决方案

### 方案1: 检查WDA是否已安装（最常见）

```bash
# 查看设备上安装的所有应用
python3 -m pymobiledevice3 apps list --user

# 查找WDA相关的bundle ID
python3 -m pymobiledevice3 apps list --user | grep -i webdriver
```

**如果没有输出**，说明WDA未安装，需要先安装WDA。

### 方案2: 安装WebDriverAgent

#### 选项A: 使用Appium的WDA（推荐）

```bash
# 1. 克隆Appium的WebDriverAgent
git clone https://github.com/appium/WebDriverAgent
cd WebDriverAgent

# 2. 用Xcode打开项目
open WebDriverAgent.xcodeproj

# 3. 在Xcode中:
#    - 选择 WebDriverAgentRunner scheme
#    - 选择你的iOS设备
#    - 修改 bundle ID（如果有签名问题）
#    - Product → Test (Cmd+U)

# 4. 记录你的bundle ID，例如:
#    com.facebook.WebDriverAgentRunner.xctrunner (默认)
#    或 com.yourcompany.WebDriverAgentRunner.xctrunner (如果你修改了)
```

#### 选项B: 使用pymobiledevice3安装预编译的WDA

```bash
# 如果你有.app文件
python3 -m pymobiledevice3 apps install <path-to-WebDriverAgentRunner-Runner.app>
```

### 方案3: 设置正确的Bundle ID

安装WDA后，告诉ByteAutoUI你的bundle ID：

```bash
# 使用CLI设置
byteautoui ios-config set-wda-bundle-id <YOUR_DEVICE_UDID> com.facebook.WebDriverAgentRunner.xctrunner

# 或者通过Python
from byteautoui.utils.ios_config import get_ios_config_manager
config_manager = get_ios_config_manager()
config_manager.set_wda_bundle_id("<YOUR_DEVICE_UDID>", "com.facebook.WebDriverAgentRunner.xctrunner")
```

### 方案4: 通过前端API设置（新增）

```bash
# 获取当前配置
curl http://127.0.0.1:20242/api/ios/<DEVICE_UDID>/ios-config

# 设置新配置
curl -X POST http://127.0.0.1:20242/api/ios/<DEVICE_UDID>/ios-config \
  -H "Content-Type: application/json" \
  -d '{"wda_bundle_id": "com.facebook.WebDriverAgentRunner.xctrunner"}'
```

---

## 验证WDA是否正确安装

### 方法1: 通过pymobiledevice3手动启动

```bash
# 手动启动WDA
python3 -m pymobiledevice3 developer dvt xcuitest com.facebook.WebDriverAgentRunner.xctrunner

# 如果成功，应该看到类似输出:
# Running tests...
# Test Case '-[UITestingUITests testRunner]' started.
```

### 方法2: 检查端口

```bash
# 在另一个终端，检查8100端口
curl http://localhost:8100/status

# 如果WDA正在运行，会返回JSON:
# {"value":{"message":"WebDriverAgent is ready","state":"success","os":{"name":"iOS","version":"17.2"},...}}
```

---

## iOS 17+ 特殊要求

如果你的设备是iOS 17或更高版本：

### 1. 启用开发者模式

```
设置 → 隐私与安全 → 开发者模式 → 开启
# 设备会重启
```

### 2. 挂载开发者磁盘镜像

```bash
python3 -m pymobiledevice3 mounter auto-mount
```

---

## 常见Bundle ID列表

- `com.facebook.WebDriverAgentRunner.xctrunner` (Facebook原版)
- `com.appium.WebDriverAgentRunner.xctrunner` (Appium版本)
- `com.<你的TeamID>.WebDriverAgentRunner.xctrunner` (自定义签名)

---

## 完整测试流程

```bash
# 1. 查找你的设备UDID
byteautoui ios-config list-devices

# 2. 确认WDA已安装
python3 -m pymobiledevice3 apps list --user | grep -i webdriver

# 3. 设置正确的bundle ID
byteautoui ios-config set-wda-bundle-id <UDID> <YOUR_BUNDLE_ID>

# 4. 查看配置
byteautoui ios-config show-config <UDID>

# 5. 启动ByteAutoUI
byteautoui server

# 6. 在前端选择iOS设备
# 应该能自动启动WDA并查看元素树
```

---

## 前端配置界面（待实现）

当前后端已提供API：
- `GET /api/ios/{serial}/ios-config` - 获取配置
- `POST /api/ios/{serial}/ios-config` - 设置配置

**前端需要添加**：
1. 在设备列表显示配置状态（已配置/未配置）
2. 点击iOS设备时，如果WDA启动失败，显示配置弹窗
3. 弹窗内容：
   - 输入框：WDA Bundle ID
   - 输入框：WDA端口（默认8100）
   - 保存按钮
   - 帮助链接（指向文档）

---

## 获取帮助

如果以上都无法解决：

1. 检查日志中的完整错误信息
2. 确认pymobiledevice3版本 >= 4.0.0
3. 尝试用Xcode直接运行WDA测试
4. 查看GitHub Issues: https://github.com/appium/WebDriverAgent/issues
