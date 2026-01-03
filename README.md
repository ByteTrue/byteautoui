# ByteAutoUI

移动端 UI 自动化检查工具，基于 [uiautodev](https://github.com/codeskyblue/uiautodev) 深度定制。

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
- iOS：确认 WDA 已启动
- Harmony：安装 `hypium` 依赖

## 许可证

MIT License

基于 [uiautodev](https://github.com/codeskyblue/uiautodev)（MIT）
