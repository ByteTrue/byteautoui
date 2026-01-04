# ByteAutoUI

移动端 UI 自动化检查工具，基于 [uiautodev](https://github.com/codeskyblue/uiautodev) 二次开发。

支持 Android/iOS/Harmony 设备的 UI 层级检查、元素定位、XPath 生成等功能。

## 快速开始

### 安装依赖

```bash
# 使用 uv（推荐）
uv sync

# 或使用 pip
pip install -r requirements.txt
```

### 启动服务

```bash
# BoolTox 插件方式
python backend/main.py

# 独立运行
python -m byteautoui server
```

访问 http://127.0.0.1:20242

## iOS 支持

### 前置要求

1. **安装 go-ios** (必需)

   ByteAutoUI 使用 go-ios 自动启动 WebDriverAgent (WDA)。

   ```bash
   # macOS (Homebrew)
   brew install go-ios

   # 其他平台：从 GitHub 下载预编译二进制
   # https://github.com/danielpaulus/go-ios/releases
   ```

   验证安装:
   ```bash
   ios version
   ```

2. **部署 WebDriverAgent 到设备**

   需要手动将 WDA 安装到 iOS 设备（仅需一次）:

   - 使用 Xcode 打开 WebDriverAgent.xcodeproj
   - 修改 Bundle ID（例如: `com.yourname.WebDriverAgentRunner.xctrunner`）
   - 在真机上运行 WebDriverAgentRunner target
   - 信任开发者证书

   详细步骤: https://appium.io/docs/en/latest/drivers/ios-xcuitest-driver/#webdriveragent

### 使用方法

1. **首次连接设备**

   启动 ByteAutoUI 后选择 iOS 设备，首次使用会提示配置 WDA Bundle ID。

2. **配置 WDA**

   在配置对话框中输入你的 WDA Bundle ID，例如:
   ```
   com.yourname.WebDriverAgentRunner.xctrunner
   ```

   配置会自动保存到 `~/.byteautoui/ios_config.json`，下次无需重新输入。

3. **自动启动**

   配置完成后，ByteAutoUI 会自动:
   - 启动 go-ios tunnel（iOS 17+ 需要）
   - 启动 WDA 服务
   - 建立端口转发 (8100:8100)

### 故障排查

**WDA 启动失败**
- 检查 WDA 是否已安装: 在设备主屏幕查看是否有 WebDriverAgentRunner 图标
- 验证 Bundle ID 是否正确
- 确认开发者证书已信任
- 查看日志: `ios runwda --bundleid=<your-bundle-id> --udid=<device-udid>`

**设备未识别**
- 检查 USB 连接
- 运行 `ios list` 确认设备可见
- iOS 17+ 需要开启开发者模式

**端口冲突**
- 默认端口 8100 被占用时，可在配置对话框修改 WDA 端口
- 或手动编辑 `~/.byteautoui/ios_config.json`

## 功能特性

- **多平台支持**：Android（ADB/uiautomator2）、iOS（WDA）、Harmony（hypium）
- **实时预览**：Scrcpy 投屏 + 触摸控制
- **层级检查**：查看 UI 树结构，生成 XPath
- **元素定位**：点击屏幕定位元素，显示属性
- **录制回放**：录制操作序列，支持 Python/YAML 导出
- **颜色取色**：提取屏幕像素颜色值
- **本地运行**：无需网络，所有资源本地化

## 目录结构

```
byteautoui/
├── backend/                # BoolTox 启动脚本
├── byteautoui/             # Python 后端（FastAPI）
│   ├── app.py              # API 入口
│   ├── driver/             # 设备驱动
│   ├── router/             # API 路由
│   └── remote/             # 远程控制（scrcpy 等）
├── web/                    # Vue 3 前端源码
│   └── src/                # TypeScript + Naive UI
├── static/                 # 前端构建产物
├── pyproject.toml          # Python 项目配置
└── requirements.txt        # Python 依赖
```

## 开发指南

### 前端开发

```bash
cd web
pnpm install
pnpm dev                    # 启动开发服务器（端口 5173）
pnpm build                  # 构建到 ../static/
```

### 后端开发

```bash
# 添加依赖
uv add <package-name>

# 更新 requirements.txt
uv export --no-hashes --no-dev > requirements.txt
```

直接编辑 `byteautoui/` 下的代码即可，重启服务生效。

## 故障排查

**端口冲突**
```bash
# macOS/Linux
lsof -ti:20242 | xargs kill -9

# Windows
netstat -ano | findstr :20242
taskkill /F /PID <PID>
```

**设备连接失败**
- Android：检查 `adb devices`，确认设备授权
- iOS：确认已安装 go-ios 和 WDA，检查配置对话框中的 Bundle ID
- Harmony：安装 `hypium` 依赖

## 许可证

MIT License

基于 [uiautodev](https://github.com/codeskyblue/uiautodev)（MIT）
