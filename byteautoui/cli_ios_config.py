#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""iOS配置管理CLI工具"""

import click
from rich.console import Console
from rich.table import Table

from byteautoui.utils.ios_config import get_ios_config_manager
from byteautoui.provider import IOSProvider

console = Console()


@click.group()
def ios():
    """iOS设备配置管理"""
    pass


@ios.command()
def list_devices():
    """列出所有iOS设备"""
    try:
        provider = IOSProvider()
        devices = provider.list_devices()

        if not devices:
            console.print("[yellow]No iOS devices found[/yellow]")
            return

        table = Table(title="iOS Devices")
        table.add_column("Serial (UDID)", style="cyan")
        table.add_column("Model", style="magenta")
        table.add_column("Name", style="green")

        for dev in devices:
            table.add_row(dev.serial, dev.model or "unknown", dev.name or "unknown")

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@ios.command()
@click.argument('device_udid')
@click.argument('bundle_id')
def set_wda_bundle_id(device_udid: str, bundle_id: str):
    """
    设置设备的WDA bundle ID

    Example:
        byteautoui ios set-wda-bundle-id <UDID> com.facebook.WebDriverAgentRunner.xctrunner
    """
    try:
        config_manager = get_ios_config_manager()
        config_manager.set_wda_bundle_id(device_udid, bundle_id)
        console.print(f"[green]✓[/green] WDA bundle ID saved for device {device_udid[:8]}...")
        console.print(f"  Bundle ID: {bundle_id}")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@ios.command()
@click.argument('device_udid')
def show_config(device_udid: str):
    """
    显示设备的配置

    Example:
        byteautoui ios show-config <UDID>
    """
    try:
        config_manager = get_ios_config_manager()
        config = config_manager.get_device_config(device_udid)

        table = Table(title=f"Config for {device_udid[:8]}...")
        table.add_column("Setting", style="cyan")
        table.add_column("Value", style="green")

        table.add_row("WDA Bundle ID", config['wda_bundle_id'])
        table.add_row("WDA Port", str(config['wda_port']))

        console.print(table)

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@ios.command()
def show_all_configs():
    """显示所有设备的配置"""
    try:
        config_manager = get_ios_config_manager()

        # 读取配置文件
        if not config_manager.config_file.exists():
            console.print("[yellow]No configurations found[/yellow]")
            return

        import json
        with open(config_manager.config_file, 'r') as f:
            configs = json.load(f)

        if not configs:
            console.print("[yellow]No configurations found[/yellow]")
            return

        table = Table(title="All iOS Device Configurations")
        table.add_column("Device UDID", style="cyan")
        table.add_column("WDA Bundle ID", style="green")
        table.add_column("WDA Port", style="magenta")

        for udid, config in configs.items():
            table.add_row(
                udid[:16] + "...",
                config.get('wda_bundle_id', 'default'),
                str(config.get('wda_port', 8100))
            )

        console.print(table)
        console.print(f"\nConfig file: {config_manager.config_file}")

    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@ios.command()
@click.argument('device_udid')
@click.confirmation_option(prompt='Are you sure you want to clear this device config?')
def clear_config(device_udid: str):
    """
    清除设备的配置

    Example:
        byteautoui ios clear-config <UDID>
    """
    try:
        config_manager = get_ios_config_manager()
        config_manager.clear_device_config(device_udid)
        console.print(f"[green]✓[/green] Config cleared for device {device_udid[:8]}...")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


if __name__ == '__main__':
    ios()
