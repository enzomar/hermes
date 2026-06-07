"""LiteLLM-based adapter for standard providers (OpenAI, Anthropic, Groq, etc.)."""

from __future__ import annotations

import os
from time import perf_counter
from typing import Any

import litellm
from litellm import acompletion

from config import LLMConfig
from core.event_bus import EventBus
from core.event_model import EventType
from llm.providers.base import CompletionResult
from llm.streaming import StreamAccumulator


# Default API base URLs per provider
PROVIDER_DEFAULT_API_BASE: dict[str, str] = {
    "anthropic": "https://api.anthropic.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "mistral": "https://api.mistral.ai/v1",
    "together": "https://api.together.xyz/v1",
    "perplexity": "https://api.perplexity.ai",
    "openrouter": "https://openrouter.ai/api/v1",
    "google": "https://generativelanguage.googleapis.com/v1beta/openai",
    "cohere": "https://api.cohere.ai/v1",
    "fireworks": "https://api.fireworks.ai/inference/v1",
    "deepseek": "https://api.deepseek.com/v1",
}

# Litellm model name prefixes for provider routing
PROVIDER_PREFIX: dict[str, str] = {
    "openrouter": "openrouter/",
    "anthropic": "anthropic/",
    "groq": "groq/",
    "mistral": "mistral/",
    "together": "together_ai/",
    "perplexity": "perplexity/",
    "google": "gemini/",
    "cohere": "cohere/",
    "fireworks": "fireworks_ai/",
    "deepseek": "deepseek/",
}


class LitellmAdapter:
    """Adapter for all providers routed through litellm."""

    def _resolve_api_key(self, config: LLMConfig) -> str | None:
        from core.keystore import Keystore
        ks = Keystore()
        if not config.api_key_env:
            return None
        return ks.resolve(config.api_key_env.strip())

    def _api_base(self, config: LLMConfig) -> str | None:
        if config.api_base:
            return config.api_base
        return PROVIDER_DEFAULT_API_BASE.get(config.provider)

    def _litellm_model_name(self, config: LLMConfig) -> str:
        model = config.model
        prefix = PROVIDER_PREFIX.get(config.provider, "")
        if not prefix:
            return model
        if model.startswith(prefix):
            return model
        return f"{prefix}{model}"

    def _completion_kwargs(self, config: LLMConfig, **overrides: Any) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "temperature": config.temperature,
            "api_base": self._api_base(config),
            "api_key": self._resolve_api_key(config),
            "timeout": config.timeout_seconds,
        }
        if config.custom_llm_provider:
            kwargs["custom_llm_provider"] = config.custom_llm_provider
        if config.top_p is not None:
            kwargs["top_p"] = config.top_p
        if config.presence_penalty is not None:
            kwargs["presence_penalty"] = config.presence_penalty
        if config.frequency_penalty is not None:
            kwargs["frequency_penalty"] = config.frequency_penalty
        kwargs.update(overrides)
        return kwargs

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
        started = perf_counter()
        accumulator = StreamAccumulator()
        model_name = self._litellm_model_name(config)

        stream = await acompletion(
            model=model_name,
            messages=messages,
            tools=tools or None,
            tool_choice="auto" if tools else None,
            stream=True,
            stream_options={"include_usage": True},
            max_tokens=config.max_tokens,
            **self._completion_kwargs(config),
        )

        async for chunk in stream:
            for token in accumulator.ingest(chunk):
                if bus and session_id:
                    await bus.publish(
                        EventType.LLM_TOKEN,
                        session_id,
                        {"call_id": call_id, "text": token},
                    )

        return CompletionResult(
            assistant_message=accumulator.assistant_message(),
            usage=accumulator.usage or {},
            latency_ms=(perf_counter() - started) * 1000,
            finish_reason=accumulator.finish_reason,
        )

    async def test_connection(self, config: LLMConfig) -> dict[str, Any]:
        model_name = self._litellm_model_name(config)
        started = perf_counter()

        response = await acompletion(
            model=model_name,
            messages=[{"role": "user", "content": "Reply with the single word OK."}],
            stream=False,
            max_tokens=max(1, min(config.max_tokens, 12)),
            **self._completion_kwargs(config, temperature=0, timeout=min(config.timeout_seconds, 20)),
        )

        latency_ms = (perf_counter() - started) * 1000
        payload = response.model_dump(mode="json") if hasattr(response, "model_dump") else response
        choices = payload.get("choices", []) if isinstance(payload, dict) else []
        message = ""
        if choices:
            first_choice = choices[0] or {}
            first_message = first_choice.get("message") or {}
            message = str(first_message.get("content") or "").strip()

        return {
            "model": config.model,
            "provider": config.provider,
            "latency_ms": latency_ms,
            "message": message or "OK",
        }
