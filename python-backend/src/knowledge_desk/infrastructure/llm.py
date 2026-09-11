"""OpenAI-compatible chat client used for optional content organisation.

Only the base URL, model name and credential travel to the provider. Failures
are normalised into :class:`ModelUnavailableError` with a message that never
echoes the credential or the raw provider payload.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from knowledge_desk.errors import ModelUnavailableError
from knowledge_desk.infrastructure.redaction import redact

CONNECTIVITY_PROMPT = "ping"
DEFAULT_MAX_TOKENS = 900
CONNECTIVITY_MAX_TOKENS = 8


@dataclass(frozen=True)
class ChatCompletion:
    text: str
    model: str


class ChatClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float = 30.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._timeout_seconds = timeout_seconds

    def _client(self):
        # Imported lazily so the base feature set never depends on the SDK
        # being importable at runtime.
        from openai import OpenAI

        return OpenAI(
            base_url=self._base_url or None,
            api_key=self._api_key,
            timeout=self._timeout_seconds,
            max_retries=0,
        )

    def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        json_mode: bool = False,
    ) -> ChatCompletion:
        messages: list[dict[str, str]] = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = self._client().chat.completions.create(**kwargs)
        except Exception as exc:  # noqa: BLE001 - normalise provider/SDK errors
            raise _translate_error(exc) from exc

        choices = getattr(response, "choices", None) or []
        if not choices:
            raise ModelUnavailableError("模型没有返回任何内容")
        content = getattr(choices[0].message, "content", None) or ""
        return ChatCompletion(text=content.strip(), model=getattr(response, "model", self._model))

    def verify_connectivity(self) -> ChatCompletion:
        return self.complete(
            system_prompt="",
            user_prompt=CONNECTIVITY_PROMPT,
            max_tokens=CONNECTIVITY_MAX_TOKENS,
        )


def _translate_error(exc: Exception) -> ModelUnavailableError:
    name = type(exc).__name__.lower()
    message = redact(str(exc)) or ""
    lowered = message.lower()

    if "timeout" in name or "timed out" in lowered or "timeout" in lowered:
        return ModelUnavailableError("模型响应超时，请稍后重试或检查网络与代理设置")
    if "authentication" in name or "401" in lowered or "invalid api key" in lowered:
        return ModelUnavailableError("模型源凭据无效，请重新填写 API Key")
    if "permission" in name or "403" in lowered:
        return ModelUnavailableError("模型源拒绝了本次请求，请确认套餐与权限")
    if "notfound" in name or "404" in lowered:
        return ModelUnavailableError("模型或接口地址不存在，请检查 Base URL 与模型名")
    if "ratelimit" in name or "429" in lowered:
        return ModelUnavailableError("模型源触发限流，请稍后重试")
    if "connection" in name or "connect" in lowered:
        return ModelUnavailableError("无法连接模型源，请检查网络或代理设置")
    return ModelUnavailableError("模型调用失败，请在模型源设置中重新测试连通性")


def parse_json_object(text: str) -> dict[str, Any] | None:
    """Best-effort extraction of a JSON object from a model response."""

    if not text:
        return None
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if "\n" in candidate:
            candidate = candidate.split("\n", 1)[1]
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(candidate[start : end + 1])
        except json.JSONDecodeError:
            return None
    return parsed if isinstance(parsed, dict) else None
