#!/bin/bash
# WDA诊断脚本

echo "========== iOS设备WDA诊断工具 =========="
echo ""

DEVICE_UDID="00008140-0008484C3AC2801C"

echo "1. 检查设备连接状态..."
python3 -m pymobiledevice3 usbmux list
echo ""

echo "2. 查找设备上所有已安装的应用（包含WebDriver关键词）..."
echo "这可能需要几秒钟..."
python3 -m pymobiledevice3 apps list --user | grep -i webdriver
echo ""

echo "3. 如果上面没有输出，说明WDA未安装。显示所有已安装应用的bundle ID..."
echo "（查找包含'xctrunner'或'WebDriverAgent'的bundle ID）"
python3 -m pymobiledevice3 apps list --user | grep -i -E "(xctrunner|webdriveragent)"
echo ""

echo "4. 检查开发者模式状态（iOS 17+）..."
python3 -m pymobiledevice3 amfi developer-mode-status
echo ""

echo "========== 手动测试WDA启动 =========="
echo "请根据上面第2步或第3步找到的实际bundle ID，手动测试启动："
echo ""
echo "运行以下命令（替换<ACTUAL_BUNDLE_ID>为实际的bundle ID）："
echo "python3 -m pymobiledevice3 developer dvt xcuitest <ACTUAL_BUNDLE_ID>"
echo ""
echo "例如："
echo "python3 -m pymobiledevice3 developer dvt xcuitest com.byte.WebDriverAgentRunner.xctrunner"
echo ""
echo "如果启动成功，会看到类似输出："
echo "Running tests..."
echo "Test Case '-[UITestingUITests testRunner]' started."
echo ""
echo "然后在另一个终端检查端口："
echo "curl http://localhost:8100/status"
