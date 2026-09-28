#!/usr/bin/env python3
"""Reserve one DeviceFarmer/STF device and run an Appium 2 smoke session.

Required environment variables:
  STF_URL, STF_TOKEN, DEVICE_SERIAL

Choose either:
  APP_PATH
or:
  APP_PACKAGE and APP_ACTIVITY

The Appium server must already be running and must be able to see the same ADB
server/device connection established by this process.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import requests
from appium import webdriver
from appium.options.android import UiAutomator2Options


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


STF_URL = required_env("STF_URL").rstrip("/")
STF_TOKEN = required_env("STF_TOKEN")
DEVICE_SERIAL = required_env("DEVICE_SERIAL")
APPIUM_URL = os.environ.get("APPIUM_URL", "http://127.0.0.1:4723").rstrip("/")
APP_PATH = os.environ.get("APP_PATH", "").strip()
APP_PACKAGE = os.environ.get("APP_PACKAGE", "").strip()
APP_ACTIVITY = os.environ.get("APP_ACTIVITY", "").strip()
SCREENSHOT_PATH = os.environ.get("SCREENSHOT_PATH", "").strip()

# STF expects milliseconds. Appium newCommandTimeout expects seconds.
STF_LEASE_TIMEOUT_MS = int(os.environ.get("STF_LEASE_TIMEOUT_MS", "1800000"))
APPIUM_NEW_COMMAND_TIMEOUT_SEC = int(
    os.environ.get("APPIUM_NEW_COMMAND_TIMEOUT_SEC", "300")
)
ADB_COMMAND_TIMEOUT_SEC = int(os.environ.get("ADB_COMMAND_TIMEOUT_SEC", "30"))


class STFClient:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            }
        )

    def request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = self.session.request(
            method,
            f"{self.base_url}{path}",
            timeout=(10, 30),
            **kwargs,
        )
        response.raise_for_status()
        data = response.json()
        if data.get("success") is False:
            raise RuntimeError(data.get("description") or f"STF request failed: {path}")
        return data

    def get_device(self, serial: str) -> dict[str, Any]:
        data = self.request(
            "GET",
            f"/api/v1/devices/{serial}",
            params={"fields": "serial,present,ready,using,owner"},
        )
        return data["device"]

    def owns(self, serial: str) -> bool:
        data = self.request(
            "GET",
            "/api/v1/user/devices",
            params={"fields": "serial"},
        )
        return any(item.get("serial") == serial for item in data.get("devices", []))

    def reserve(self, serial: str, timeout_ms: int) -> None:
        self.request(
            "POST",
            "/api/v1/user/devices",
            json={"serial": serial, "timeout": timeout_ms},
        )

    def remote_connect(self, serial: str) -> str:
        data = self.request(
            "POST", f"/api/v1/user/devices/{serial}/remoteConnect"
        )
        return data["remoteConnectUrl"]

    def remote_disconnect(self, serial: str) -> None:
        self.request(
            "DELETE", f"/api/v1/user/devices/{serial}/remoteConnect"
        )

    def release(self, serial: str) -> None:
        self.request("DELETE", f"/api/v1/user/devices/{serial}")


def adb(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["adb", *args],
        check=check,
        text=True,
        capture_output=True,
        timeout=ADB_COMMAND_TIMEOUT_SEC,
    )


def best_effort(label: str, action: Any) -> None:
    try:
        action()
    except Exception as exc:  # cleanup must not hide the original test failure
        print(f"cleanup warning ({label}): {exc}", file=sys.stderr)


def main() -> int:
    stf = STFClient(STF_URL, STF_TOKEN)
    driver: webdriver.Remote | None = None
    remote_url: str | None = None
    claim_attempted = False
    lease_acquired = False
    remote_enabled = False

    try:
        device = stf.get_device(DEVICE_SERIAL)
        if (
            not device.get("present")
            or not device.get("ready")
            or device.get("using")
            or device.get("owner")
        ):
            raise RuntimeError(f"Device is not available: {device}")

        # POST is the authority for concurrency. The preceding GET is only an
        # informative pre-check and can race with another worker.
        claim_attempted = True
        stf.reserve(DEVICE_SERIAL, STF_LEASE_TIMEOUT_MS)
        lease_acquired = True

        remote_url = stf.remote_connect(DEVICE_SERIAL)
        remote_enabled = True

        result = adb("connect", remote_url)
        print(result.stdout.strip())
        state = adb("-s", remote_url, "get-state").stdout.strip()
        if state != "device":
            raise RuntimeError(f"ADB target is not online: {remote_url} ({state})")

        capabilities: dict[str, Any] = {
            "platformName": "Android",
            "appium:automationName": "UiAutomator2",
            # For an adb-over-network target, adb identifies the device using
            # the remoteConnectUrl (host:port), not STF's physical serial.
            "appium:udid": remote_url,
            "appium:newCommandTimeout": APPIUM_NEW_COMMAND_TIMEOUT_SEC,
        }

        if APP_PATH:
            capabilities["appium:app"] = str(Path(APP_PATH).expanduser().resolve())
        elif APP_PACKAGE and APP_ACTIVITY:
            capabilities.update(
                {
                    "appium:appPackage": APP_PACKAGE,
                    "appium:appActivity": APP_ACTIVITY,
                    "appium:noReset": True,
                }
            )

        options = UiAutomator2Options().load_capabilities(capabilities)
        driver = webdriver.Remote(APPIUM_URL, options=options)

        # Replace this smoke assertion with the project's real Appium test.
        size = driver.get_window_size()
        print(
            f"Appium session {driver.session_id} is running on "
            f"{remote_url}; window={size['width']}x{size['height']}"
        )
        if SCREENSHOT_PATH:
            if not driver.get_screenshot_as_file(SCREENSHOT_PATH):
                raise RuntimeError(f"Failed to save screenshot: {SCREENSHOT_PATH}")

        return 0
    finally:
        if driver is not None:
            best_effort("Appium driver.quit", driver.quit)
        if remote_url is not None:
            best_effort("adb disconnect", lambda: adb("disconnect", remote_url))
        if remote_enabled:
            best_effort(
                "STF remote disconnect",
                lambda: stf.remote_disconnect(DEVICE_SERIAL),
            )

        # A POST may succeed server-side even if its HTTP response times out.
        # Re-check ownership before cleanup. Do not run concurrent jobs for the
        # same serial with the same STF user/token; use an external serial lock.
        should_release = lease_acquired
        if claim_attempted and not should_release:
            try:
                should_release = stf.owns(DEVICE_SERIAL)
            except Exception as exc:
                print(f"cleanup warning (STF ownership check): {exc}", file=sys.stderr)
        if should_release:
            best_effort("STF device release", lambda: stf.release(DEVICE_SERIAL))


if __name__ == "__main__":
    raise SystemExit(main())
