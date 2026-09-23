#!/usr/bin/env python3
"""Create a Sonic UI case: login -> mic on -> mic off -> camera on.

Required environment variables:
  SONIC_BASE_URL   Example: http://sonic.example.com/server/api
  SONIC_PROJECT_ID Sonic project id

Authentication (choose one):
  SONIC_TOKEN
or:
  SONIC_USERNAME
  SONIC_PASSWORD

Replace LOCATORS below with accessibility ids/resource ids from the target app.
"""

from __future__ import annotations

import os
import time
from typing import Any

import requests


BASE_URL = os.environ["SONIC_BASE_URL"].rstrip("/")
PROJECT_ID = int(os.environ["SONIC_PROJECT_ID"])
PLATFORM = int(os.getenv("SONIC_PLATFORM", "1"))  # 1=Android, 2=iOS

# accessibilityId is usually the most portable choice across Android and iOS.
LOCATORS = [
    ("登录按钮", "accessibilityId", "login_button"),
    ("麦克风关闭图标", "accessibilityId", "microphone_off"),
    ("麦克风开启图标", "accessibilityId", "microphone_on"),
    ("摄像头关闭图标", "accessibilityId", "camera_off"),
]


class SonicClient:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})

        token = os.getenv("SONIC_TOKEN")
        if not token:
            token = self.login(
                os.environ["SONIC_USERNAME"],
                os.environ["SONIC_PASSWORD"],
            )
        self.session.headers.update({"SonicToken": token})

    def request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = self.session.request(
            method,
            f"{BASE_URL}{path}",
            timeout=20,
            **kwargs,
        )
        response.raise_for_status()
        body = response.json()
        if body.get("code") != 2000:
            raise RuntimeError(f"Sonic API failed: {body}")
        return body

    def login(self, username: str, password: str) -> str:
        response = requests.post(
            f"{BASE_URL}/controller/users/login",
            json={"userName": username, "password": password},
            timeout=20,
        )
        response.raise_for_status()
        body = response.json()
        if body.get("code") != 2000 or not body.get("data"):
            raise RuntimeError(f"Sonic login failed: {body}")
        return str(body["data"])

    def find_element(self, name: str, ele_type: str, value: str) -> dict[str, Any] | None:
        body = self.request(
            "GET",
            "/controller/elements/list",
            params={
                "projectId": PROJECT_ID,
                "name": name,
                "value": value,
                "eleTypes[]": ele_type,
                "page": 1,
                "pageSize": 100,
            },
        )
        for element in body["data"]["content"]:
            if (
                element["eleName"] == name
                and element["eleType"] == ele_type
                and element["eleValue"] == value
            ):
                return element
        return None

    def ensure_element(self, name: str, ele_type: str, value: str) -> dict[str, Any]:
        existing = self.find_element(name, ele_type, value)
        if existing:
            return existing

        self.request(
            "PUT",
            "/controller/elements",
            json={
                "id": None,
                "eleName": name,
                "eleType": ele_type,
                "eleValue": value,
                "moduleId": 0,
                "projectId": PROJECT_ID,
            },
        )
        created = self.find_element(name, ele_type, value)
        if not created:
            raise RuntimeError(f"Element was created but cannot be read back: {name}")
        return created

    def create_case(self, name: str) -> int:
        # Sonic's create endpoint does not return the generated id. A unique
        # case name is used here so the record can be read back safely.
        self.request(
            "PUT",
            "/controller/testCases",
            json={
                "id": None,
                "name": name,
                "platform": PLATFORM,
                "projectId": PROJECT_ID,
                "moduleId": 0,
                "version": "AI-Agent-Demo",
                "des": "点击登录，开启麦克风，关闭麦克风，开启摄像头",
                "designer": "AI Agent",
            },
        )

        body = self.request(
            "GET",
            "/controller/testCases/list",
            params={
                "projectId": PROJECT_ID,
                "platform": PLATFORM,
                "name": name,
                "page": 1,
                "pageSize": 20,
                "idSort": "desc",
            },
        )
        matches = [case for case in body["data"]["content"] if case["name"] == name]
        if not matches:
            raise RuntimeError("Case was created but cannot be read back")
        return int(max(matches, key=lambda case: case["id"])["id"])

    def add_click_step(self, case_id: int, element: dict[str, Any]) -> None:
        self.request(
            "PUT",
            "/controller/steps",
            json={
                "id": None,
                "parentId": 0,
                "projectId": PROJECT_ID,
                "caseId": case_id,
                "platform": PLATFORM,
                "stepType": "click",
                "content": "",
                "text": "",
                "error": 3,
                "conditionType": 0,
                "disabled": 0,
                "elements": [element],
            },
        )

    def list_steps(self, case_id: int) -> list[dict[str, Any]]:
        body = self.request(
            "GET",
            "/controller/steps/listAll",
            params={"caseId": case_id},
        )
        return list(body["data"])


def main() -> None:
    client = SonicClient()
    elements = [client.ensure_element(*locator) for locator in LOCATORS]

    unique_name = f"AI-音视频开关流程-{int(time.time())}"
    case_id = client.create_case(unique_name)

    for element in elements:
        client.add_click_step(case_id, element)

    steps = client.list_steps(case_id)
    if len(steps) != 4:
        raise RuntimeError(f"Expected 4 steps, got {len(steps)}")

    print(f"Created Sonic case: id={case_id}, name={unique_name}, steps={len(steps)}")


if __name__ == "__main__":
    main()
