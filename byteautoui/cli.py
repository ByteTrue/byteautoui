#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Created on Tue Mar 19 2024 10:53:03 by codeskyblue
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import sys
import threading
import time
from pprint import pprint

import click
import httpx
import pydantic
import uvicorn
from retry import retry
from rich.logging import RichHandler

from byteautoui import __version__, command_proxy
from byteautoui.command_types import Command
from byteautoui.common import get_webpage_url
from byteautoui.provider import AndroidProvider, BaseProvider, IOSProvider
from byteautoui.utils.common import convert_params_to_model, print_json

logger = logging.getLogger(__name__)

CONTEXT_SETTINGS = dict(help_option_names=['-h', '--help'])
HARMONY_PACKAGES = [
    "setuptools",
    "https://public.uiauto.devsleep.com/harmony/xdevice-5.0.7.200.tar.gz",
    "https://public.uiauto.devsleep.com/harmony/xdevice-devicetest-5.0.7.200.tar.gz",
    "https://public.uiauto.devsleep.com/harmony/xdevice-ohos-5.0.7.200.tar.gz",
    "https://public.uiauto.devsleep.com/harmony/hypium-5.0.7.200.tar.gz",
]


def enable_logger_to_console(level):
    _logger = logging.getLogger("byteautoui")
    _logger.setLevel(level)
    _logger.addHandler(RichHandler(enable_link_path=False))


@click.group(context_settings=CONTEXT_SETTINGS)
@click.option("--verbose", "-v", is_flag=True, default=False, help="verbose mode")
def cli(verbose: bool):
    if verbose:
        enable_logger_to_console(level=logging.DEBUG)
        logger.debug("Verbose mode enabled")
    else:
        enable_logger_to_console(level=logging.INFO)


def run_driver_command(provider: BaseProvider, command: Command, params: list[str] = None):
    if command == Command.LIST:
        devices = provider.list_devices()
        print("==> Devices <==")
        pprint(devices)
        return
    driver = provider.get_single_device_driver()
    params_obj = None
    model = command_proxy.get_command_params_type(command)
    if model:
        if not params:
            print(f"params is required for {command}")
            pprint(model.model_json_schema())
            return
        params_obj = convert_params_to_model(params, model)

    try:
        print("Command:", command.value)
        print("Params ↓")
        print_json(params_obj)
        result = command_proxy.send_command(driver, command, params_obj)
        print("Result ↓")
        print_json(result)
    except pydantic.ValidationError as e:
        print(f"params error: {e}")
        print(f"\n--- params should be match schema ---")
        pprint(model.model_json_schema()["properties"])


@cli.command(help="COMMAND: " + ", ".join(c.value for c in Command))
@click.argument("command", type=Command, required=True)
@click.argument("params", required=False, nargs=-1)
def android(command: Command, params: list[str] = None):
    provider = AndroidProvider()
    run_driver_command(provider, command, params)


@cli.command(help="COMMAND: " + ", ".join(c.value for c in Command))
@click.argument("command", type=Command, required=True)
@click.argument("params", required=False, nargs=-1)
def ios(command: Command, params: list[str] = None):
    provider = IOSProvider()
    run_driver_command(provider, command, params)


@cli.group(help="iOS device configuration management")
def ios_config():
    """iOS设备配置管理"""
    pass


@ios_config.command('list-devices')
def ios_list_devices():
    """列出所有iOS设备"""
    from byteautoui.cli_ios_config import list_devices
    list_devices.callback()


@ios_config.command('set-wda-bundle-id')
@click.argument('device_udid')
@click.argument('bundle_id')
def ios_set_wda_bundle_id(device_udid: str, bundle_id: str):
    """设置设备的WDA bundle ID"""
    from byteautoui.cli_ios_config import set_wda_bundle_id
    set_wda_bundle_id.callback(device_udid, bundle_id)


@ios_config.command('show-config')
@click.argument('device_udid')
def ios_show_config(device_udid: str):
    """显示设备的配置"""
    from byteautoui.cli_ios_config import show_config
    show_config.callback(device_udid)


@ios_config.command('show-all')
def ios_show_all_configs():
    """显示所有设备的配置"""
    from byteautoui.cli_ios_config import show_all_configs
    show_all_configs.callback()


@ios_config.command('clear')
@click.argument('device_udid')
@click.confirmation_option(prompt='Are you sure you want to clear this device config?')
def ios_clear_config(device_udid: str):
    """清除设备的配置"""
    from byteautoui.cli_ios_config import clear_config
    clear_config.callback(device_udid)


@cli.command(help="run case (beta)")
def case():
    from byteautoui.case import run
    run()


@cli.command(help="COMMAND: " + ", ".join(c.value for c in Command))
@click.argument("command", type=Command, required=True)
@click.argument("params", required=False, nargs=-1)
def appium(command: Command, params: list[str] = None):
    from byteautoui.driver.appium import AppiumProvider
    from byteautoui.exceptions import AppiumDriverException

    provider = AppiumProvider()
    try:
        run_driver_command(provider, command, params)
    except AppiumDriverException as e:
        print(f"Error: {e}")


@cli.command('version')
def print_version():
    """ Print version """
    print(__version__)


@cli.command('self-update')
def self_update():
    """ Update byteautoui to latest version """
    subprocess.run([sys.executable, '-m', "pip", "install", "--upgrade", "byteautoui"])


@cli.command('install-harmony')
def install_harmony():
    pip_install("hypium")

@retry(tries=2, delay=3, backoff=2)
def pip_install(package: str):
    """Install a package using pip."""
    subprocess.run([sys.executable, '-m', "pip", "install", package], check=True)
    click.echo(f"Successfully installed {package}")


@cli.command(help="start ByteAutoUI local server [Default]")
@click.option("--port", default=20242, help="port number", show_default=True)
@click.option("--host", default="127.0.0.1", help="host", show_default=True)
@click.option("--reload", is_flag=True, default=False, help="auto reload, dev only")
@click.option("-f", "--force", is_flag=True, default=False, help="shutdown already running server")
@click.option("-s", "--no-browser", is_flag=True, default=False, help="silent mode, do not open browser")
@click.option("--offline", is_flag=True, default=False, help="offline mode, do not use internet")
@click.option("--server-url", default="https://uiauto.dev", help="original uiauto.dev server url", show_default=True)
def server(port: int, host: str, reload: bool, force: bool, no_browser: bool, offline: bool, server_url: str):
    click.echo(f"byteautoui version: {__version__}")
    if force:
        try:
            httpx.get(f"http://{host}:{port}/shutdown", timeout=3)
        except httpx.HTTPError:
            pass

    use_color = True
    if platform.system() == 'Windows':
        use_color = False

    server_url = server_url.rstrip('/')
    # 不再需要设置 proxy 相关配置
    # 现在使用静态文件服务，无需 HTTP 缓存代理

    if not no_browser:
        th = threading.Thread(target=open_browser_when_server_start, args=(f"http://{host}:{port}", False))
        th.daemon = True
        th.start()
    uvicorn.run("byteautoui.app:app", host=host, port=port, reload=reload, use_colors=use_color)

@cli.command(help="shutdown ByteAutoUI local server")
@click.option("--port", default=20242, help="port number", show_default=True)
def shutdown(port: int):
    try:
        httpx.get(f"http://127.0.0.1:{port}/shutdown", timeout=3)
    except httpx.HTTPError:
        pass


def open_browser_when_server_start(local_server_url: str, offline: bool = False):
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            httpx.get(f"{local_server_url}/api/info", timeout=1)
            break
        except Exception as e:
            time.sleep(0.5)
    import webbrowser
    web_url = get_webpage_url(local_server_url if offline else None)
    logger.info("open browser: %s", web_url)
    webbrowser.open(web_url)


def main():
    has_command = False
    for name in sys.argv[1:]:
        if not name.startswith("-"):
            has_command = True

    if not has_command:
        cli.main(args=sys.argv[1:] + ["server"], prog_name="byteautoui")
    else:
        cli()


if __name__ == "__main__":
    main()
