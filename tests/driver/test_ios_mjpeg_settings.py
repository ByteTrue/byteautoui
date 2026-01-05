import json
from types import SimpleNamespace

import pytest

from byteautoui.driver import ios as ios_driver
from byteautoui.remote import ios_mjpeg_stream


class FakeResponse:
    def __init__(self, payload: bytes):
        self._payload = payload
        self._sent = False

    def getcode(self):
        return 200

    def read(self, _size: int):
        if self._sent:
            return b""
        self._sent = True
        return self._payload


class FakeConnection:
    def __init__(self, payload: bytes):
        self.payload = payload
        self.requests = []
        self.closed = False

    def request(self, method: str, path: str, body=None, headers=None):
        self.requests.append((method, path, body, headers))

    def getresponse(self):
        return FakeResponse(self.payload)

    def close(self):
        self.closed = True


class FakeDevice:
    def __init__(self, serial: str, payload: bytes):
        self.serial = serial
        self.payload = payload
        self.requested_port = None

    def make_http_connection(self, port: int = 8100):
        self.requested_port = port
        return FakeConnection(self.payload)


class FakeServer:
    instances = []

    def __init__(self, device_udid: str, wda_bundle_id=None, wda_port=None, mjpeg_port=None):
        self.device_udid = device_udid
        self.wda_bundle_id = wda_bundle_id
        self.wda_port = wda_port or 8100
        self.mjpeg_port = mjpeg_port or 9200
        self.started = False
        self.closed = False
        FakeServer.instances.append(self)

    def start(self):
        self.started = True

    def close(self):
        self.closed = True


class FakeStream:
    instances = []

    def __init__(self, device_udid: str, mjpeg_port=None, wda_port=8100):
        self.device_udid = device_udid
        self.mjpeg_port = mjpeg_port or ios_mjpeg_stream.DEFAULT_WDA_MJPEG_PORT
        self.wda_port = wda_port
        self.started = False
        self.closed = False
        FakeStream.instances.append(self)

    def start_recording(self):
        self.started = True
        return True

    def stop_recording(self):
        self.started = False
        return True

    def get_mjpeg_url(self):
        return f"http://127.0.0.1:{self.mjpeg_port}"

    def is_stream_available(self):
        return True

    def close(self):
        self.closed = True


class FakeWda:
    instances = []
    raise_on_request = False
    response_payload = {"sessionId": "fake-session", "value": {"sessionId": "fake-session"}}
    settings_exception = None

    def __init__(self, serial: str):
        self.serial = serial
        self._session_id = None
        self.request_calls = []
        self.settings_calls = []
        self.tap_calls = []
        self.swipe_calls = []
        FakeWda.instances.append(self)

    def request(self, method, path, payload=None):
        self.request_calls.append((method, path, payload))
        if self.raise_on_request:
            raise RuntimeError("capability rejected")
        return self.response_payload

    def appium_settings(self, settings):
        self.settings_calls.append(settings)
        if self.settings_exception:
            raise self.settings_exception
        return settings

    def screenshot(self):
        return "image"

    def window_size(self):
        return (10, 20)

    def sourcetree(self):
        xml = (
            "<XCUIElementTypeApplication type='XCUIElementTypeApplication' name='设置' "
            "label='设置' enabled='true' visible='true' accessible='false' x='0' y='0' "
            "width='414' height='896' index='0'>"
            "<XCUIElementTypeButton type='XCUIElementTypeButton' name='Btn' label='Btn' enabled='true' "
            "visible='true' accessible='true' x='10' y='20' width='100' height='200' index='0'/>"
            "</XCUIElementTypeApplication>"
        )
        return SimpleNamespace(value=xml)

    def tap(self, x: int, y: int):
        self.tap_calls.append((x, y))

    def swipe(self, x1: int, y1: int, x2: int, y2: int, duration: float = 0.5):
        self.swipe_calls.append((x1, y1, x2, y2, duration))

    def app_current(self):
        return SimpleNamespace(bundle_id="com.demo", pid=321)

    def homescreen(self):
        self.home_called = True

    def volume_up(self):
        self.volume_up_called = True

    def volume_down(self):
        self.volume_down_called = True


def build_driver(monkeypatch, *, fail_capabilities: bool = False, response_payload=None, settings_exception=None):
    FakeServer.instances.clear()
    FakeStream.instances.clear()
    FakeWda.instances.clear()
    FakeWda.raise_on_request = fail_capabilities
    FakeWda.response_payload = response_payload or {"sessionId": "fake-session", "value": {"sessionId": "fake-session"}}
    FakeWda.settings_exception = settings_exception

    device = FakeDevice("udid-123", json.dumps({"value": {"ready": True}}).encode())
    monkeypatch.setattr(ios_driver, "select_device", lambda serial: device)
    monkeypatch.setattr(ios_driver, "GoIOSWDAServer", FakeServer)
    monkeypatch.setattr(ios_driver, "IOSMJPEGStream", FakeStream)
    monkeypatch.setattr(ios_driver.wdapy, "AppiumUSBClient", FakeWda)

    driver = ios_driver.IOSDriver(serial="udid-123")
    return driver, device


def test_mjpeg_capabilities_injected_and_driver_ops(monkeypatch):
    driver, device = build_driver(monkeypatch)
    wda = FakeWda.instances[-1]

    assert wda.request_calls, "capability injection should be attempted"
    _, _, payload = wda.request_calls[0]
    options = payload["capabilities"]["alwaysMatch"]["appium:options"]
    assert options["mjpegServerFramerate"] == 30
    assert options["mjpegServerScreenshotQuality"] == 50
    assert options["mjpegScalingFactor"] == 50
    # When capability injection succeeds, settings API should NOT be called (no fallback needed)
    assert len(wda.settings_calls) == 0, "settings API should not be called when capability succeeds"

    assert driver.start_mjpeg_stream() is True
    assert driver.get_mjpeg_url() == "http://127.0.0.1:9200"
    assert driver.is_mjpeg_stream_available() is True
    assert driver.stop_mjpeg_stream() is True

    assert driver.screenshot() == "image"
    win = driver.window_size()
    assert (win.width, win.height) == (10, 20)
    xml, root = driver.dump_hierarchy()
    assert "XCUIElementTypeApplication" in xml
    assert root.children and root.children[0].name == "XCUIElementTypeButton"

    driver.tap(1, 2)
    driver.swipe(1, 2, 3, 4, duration=0.7)
    assert wda.tap_calls and wda.swipe_calls
    assert driver.app_current().package == "com.demo"
    driver.home()
    driver.volume_up()
    driver.volume_down()
    driver.status()
    assert device.requested_port == 8100

    driver.close()
    assert FakeStream.instances[0].closed is True
    assert FakeServer.instances[0].closed is True


def test_capability_failure_falls_back_to_settings(monkeypatch):
    driver, _ = build_driver(monkeypatch, fail_capabilities=True)
    wda = FakeWda.instances[-1]

    assert wda.settings_calls, "settings API should still be invoked on failure"
    _, _, payload = wda.request_calls[0]
    assert payload["capabilities"]["alwaysMatch"]["appium:options"]["mjpegServerFramerate"] == 30
    assert driver.start_mjpeg_stream() is True
    driver.close()


def test_request_fallback_paths(monkeypatch):
    driver, _ = build_driver(
        monkeypatch,
        response_payload={"value": {"message": "no session id"}},
        settings_exception=RuntimeError("settings fail"),
    )
    wda = FakeWda.instances[-1]

    assert wda._session_id is None
    assert wda.settings_calls, "settings fallback still attempted"

    assert driver.stop_mjpeg_stream() is True
    assert driver.get_mjpeg_url() is None
    assert driver.is_mjpeg_stream_available() is False

    assert driver._request("POST", "/status", payload={"hello": "world"})
    assert driver._request_json_value("GET", "/status") == {"ready": True}

    class ErrorConn(FakeConnection):
        def __init__(self):
            super().__init__(b"{}")

        def getresponse(self):
            resp = FakeResponse(b"{}")
            resp.getcode = lambda: 500
            return resp

    monkeypatch.setattr(driver, "device", SimpleNamespace(make_http_connection=lambda port=8100: ErrorConn()))
    with pytest.raises(ios_driver.IOSDriverException):
        driver._request("GET", "/status")

    with pytest.raises(NotImplementedError):
        driver.app_switch()

    invisible = ios_driver.ElementTree.fromstring(
        "<XCUIElementTypeButton type='XCUIElementTypeButton' visible='false' x='0' y='0' width='1' height='1'/>"
    )
    assert ios_driver.parse_xml_element(invisible, ios_driver.WindowSize(width=1, height=1)) is None


def test_ios_mjpeg_stream_defaults_and_availability(monkeypatch):
    calls = []

    class DummyConn:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    def fake_create_connection(addr, timeout=1.0):
        calls.append((addr, timeout))
        return DummyConn()

    monkeypatch.setattr(ios_mjpeg_stream.socket, "create_connection", fake_create_connection)
    stream = ios_mjpeg_stream.IOSMJPEGStream(device_udid="udid", mjpeg_port=9105)

    assert stream.start_recording() is True
    assert stream.start_recording() is True  # already streaming branch
    assert stream.get_mjpeg_url() == "http://127.0.0.1:9105"
    assert stream.is_stream_available() is True
    assert stream.stop_recording() is True
    stream.close()
    assert calls, "port check should happen"

    tuned = ios_mjpeg_stream.build_wda_mjpeg_settings({"mjpegServerFramerate": 25, "mjpegScalingFactor": None})
    assert tuned["mjpegServerFramerate"] == 25
    assert "mjpegScalingFactor" not in tuned


def test_ios_mjpeg_stream_handles_unavailable_port(monkeypatch):
    class Clock:
        def __init__(self):
            self.now = 0.0

        def time(self):
            self.now += 2.0
            return self.now

    def raising_connection(*_args, **_kwargs):
        raise ConnectionRefusedError()

    monkeypatch.setattr(ios_mjpeg_stream.socket, "create_connection", raising_connection)
    clock = Clock()
    monkeypatch.setattr(ios_mjpeg_stream.time, "time", clock.time)
    monkeypatch.setattr(ios_mjpeg_stream.time, "sleep", lambda _s: None)

    stream = ios_mjpeg_stream.IOSMJPEGStream(device_udid="udid", mjpeg_port=9999)
    assert stream.start_recording() is False
    assert stream._is_streaming is False
