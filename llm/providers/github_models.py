"""GitHub Models adapter using OpenAI SDK directly (litellm doesn't support it)."""

from __future__ import annotations

from time import perf_counter
from typing import Any

import httpx
from openai import AsyncOpenAI

from config import LLMConfig
from core.event_bus import EventBus
from core.event_model import EventType
from llm.providers.base import CompletionResult


GITHUB_MODELS_API_BASE = "https://models.github.ai/inference"
GITHUB_MODELS_API_VERSION = "2026-03-10"


class GitHubModelsAdapter:
    """Adapter for GitHub Models using OpenAI SDK with SSL bypass."""

    def _resolve_api_key(self, config: LLMConfig) -> str | None:
        from core.keystore import Keystore
        ks = Keystore()
        if not config.api_key_env:
            return None
        return ks.resolve(config.api_key_env.strip())

    def _api_base(self, config: LLMConfig) -> str:
        return config.api_base or GITHUB_MODELS_API_BASE

    def _make_client(self, config: LLMConfig, timeout: float | None = None) -> AsyncOpenAI:
        api_key = self._resolve_api_key(config)
        if not api_key:
            raise RuntimeError("GitHub PAT is required. Set api_key_env to your GitHub personal access token.")
        http_client = httpx.AsyncClient(verify=False)
        return AsyncOpenAI(
            api_key=api_key,
            base_url=self._api_base(config),
            http_client=http_client,
            default_headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION,
            },
            timeout=timeout or config.timeout_seconds,
        )

    async def complete(
        self,
        messages: list[dict[str, Any]],
        config: LLMConfig,
        *,
        tools: list[dict[str, Any]] | None = None,
        session_id: str = "",
        call_id: str = "",
        bus: EventBus | None = None,
    ) -> CompletionResult:
        client = self._make_client(config)
        started = perf_counter()

        create_kwargs: dict[str, Any] = {
            "model": config.model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            "max_tokens": config.max_tokens,
            "temperature": config.temperature,
        }
        if config.top_p is not None:
            create_kwargs["top_p"] = config.top_p
        if config.presence_penalty is not None:
            create_kwargs["presence_penalty"] = config.presence_penalty
        if config.frequency_penalty is not None:
            create_kwargs["frequency_penalty"] = config.frequency_penalty
        if tools:
            create_kwargs["tools"] = tools
            create_kwargs["tool_choice"] = "auto"

        stream = await client.chat.completions.create(**create_kwargs)  # type: ignore

        content = ""
        tool_calls_dict: dict[int, dict[str, Any]] = {}
        finish_reason = None
        usage_data = None

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if not delta:
                continue

            if delta.content:
                content += delta.content
                if bus and session_id:
                    await bus.publish(
                        EventType.LLM_TOKEN,
                        session_id,
                        {"call_id": call_id, "text": delta.content},
                    )

            if delta.tool_calls:
                for tc_chunk in delta.tool_calls:
                    idx = tc_chunk.index
                    if idx not in tool_calls_dict:
                        tool_calls_dict[idx] = {
                            "id": tc_chunk.id or "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""},
                        }
                    if tc_chunk.function:
                        if tc_chunk.function.name:
                            tool_calls_dict[idx]["function"]["name"] += tc_chunk.function.name
                        if tc_chunk.function.arguments:
                            tool_calls_dict[idx]["function"]["arguments"] += tc_chunk.function.arguments

            if chunk.choices and chunk.choices[0].finish_reason:
                finish_reason = chunk.choices[0].finish_reason

            if hasattr(chunk, "usage") and chunk.usage:
                usage_data = chunk.usage

        latency_ms = (perf_counter() - started) * 1000
        tool_calls = [tool_calls_dict[i] for i in sorted(tool_calls_dict.keys())] if tool_calls_dict else None

        return CompletionResult(
            assistant_message={"role": "assistant", "content": content, "tool_calls": tool_calls},
            usage={
                "prompt_tokens": usage_data.prompt_tokens if usage_data else 0,
                "completion_tokens": usage_data.completion_tokens if usage_data else 0,
                "total_tokens": usage_data.total_tokens if usage_data else 0,
            },
            latency_ms=latency_ms,
            finish_reason=finish_reason or "stop",
        )

    async def test_connection(self, config: LLMConfig) -> dict[str, Any]:
        client = self._make_client(config, timeout=min(config.timeout_seconds, 20))
        started = perf_counter()

        response = await client.chat.completions.create(
            model=config.model,
            messages=[{"role": "user", "content": "Reply with the single word OK."}],
            max_tokens=max(1, min(config.max_tokens, 12)),
            temperature=0,
        )

        latency_ms = (perf_counter() - started) * 1000
        message = response.choices[0].message.content if response.choices else "OK"

        return {
            "model": config.model,
            "provider": config.provider,
            "latency_ms": latency_ms,
            "message": (message or "OK").strip(),
        }
