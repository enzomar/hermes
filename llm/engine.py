"""LLM Engine — orchestration layer.

Handles conversation flow, tool-call dispatch, and event publishing.
Provider-specific logic is delegated to adapters in llm/providers/.
"""

from __future__ import annotations

import os
from typing import Any
from uuid import uuid4

import litellm

from config import LLMConfig
from core.event_bus import EventBus
from core.event_model import EventType
from llm.providers import get_adapter
from llm.tool_bridge import ToolBridge


class LLMEngine:
    def __init__(
        self,
        config: LLMConfig,
        bus: EventBus,
        tool_bridge: ToolBridge,
        max_tool_rounds: int = 6,
    ) -> None:
        self.config = config
        self.bus = bus
        self.tool_bridge = tool_bridge
        self.max_tool_rounds = max_tool_rounds

        from core.keystore import Keystore
        self.keystore = Keystore()
        litellm.drop_params = True

        # Apply SSL verification setting globally
        if getattr(config, "skip_ssl_verify", False) or os.environ.get("HERMES_SKIP_SSL"):
            self._disable_ssl_verification()

    async def handle_user_message(
        self,
        session_id: str,
        content: str,
        attachments: list[dict[str, Any]] | None = None,
        display_content: str | None = None,
        config_override: LLMConfig | None = None,
    ) -> dict[str, Any]:
        await self.bus.publish(
            EventType.USER_MESSAGE,
            session_id,
            {
                "content": content,
                "attachments": attachments or [],
                "display_content": display_content or content,
            },
        )
        return await self.run_conversation(session_id, config_override=config_override)

    async def run_conversation(
        self,
        session_id: str,
        config_override: LLMConfig | None = None,
    ) -> dict[str, Any]:
        starting_config = config_override or self.config

        # Pre-flight: ensure API key is available
        if starting_config.provider != "local-cli":
            resolved_key = self.keystore.resolve(starting_config.api_key_env.strip()) if starting_config.api_key_env else None
            if not resolved_key and starting_config.api_key_env:
                env_name = starting_config.api_key_env.strip()
                raise RuntimeError(
                    f"Cannot authenticate with the AI provider. "
                    f"The configured value '{env_name[:12]}…' could not be resolved as an API key. "
                    f"In Settings → AI Profile → Connection, enter either:\n"
                    f"  • An environment variable name (e.g. GITHUB_TOKEN)\n"
                    f"  • Or paste your API key directly"
                )
            if not resolved_key and starting_config.provider != "local":
                raise RuntimeError(
                    "No API key configured for this AI profile. "
                    "Go to Settings → AI and set the API Key Env Variable field."
                )

        messages = await self.tool_bridge.build_messages(session_id, starting_config.system_prompt)

        for _ in range(self.max_tool_rounds):
            config = config_override or self.config

            # Update system prompt
            if messages and messages[0].get("role") == "system":
                messages[0] = {"role": "system", "content": config.system_prompt}
            else:
                messages.insert(0, {"role": "system", "content": config.system_prompt})

            llm_call_id = str(uuid4())
            tools = [] if config.provider == "local-cli" else self.tool_bridge.llm_tools()

            # Allow per-profile tool disabling
            if config.disable_tools:
                tools = []

            await self.bus.publish(
                EventType.LLM_START,
                session_id,
                {"call_id": llm_call_id, "model": config.model, "tool_count": len(tools)},
            )

            try:
                adapter = get_adapter(config)
                result = await adapter.complete(
                    messages,
                    config,
                    tools=tools or None,
                    session_id=session_id,
                    call_id=llm_call_id,
                    bus=self.bus,
                )
                assistant_message = result.assistant_message
                usage = result.usage
                latency_ms = result.latency_ms
                finish_reason = result.finish_reason
            except Exception as exc:
                await self.bus.publish(
                    EventType.ERROR,
                    session_id,
                    {"source": "llm", "call_id": llm_call_id, "message": str(exc)},
                )
                raise

            await self.bus.publish(
                EventType.LLM_END,
                session_id,
                {
                    "call_id": llm_call_id,
                    "model": config.model,
                    "assistant_message": assistant_message,
                    "usage": usage,
                    "latency_ms": latency_ms,
                    "finish_reason": finish_reason,
                },
            )

            messages.append(assistant_message)
            if assistant_message.get("tool_calls"):
                tool_messages = await self.tool_bridge.execute_tool_calls(session_id, assistant_message)
                messages.extend(tool_messages)
                continue

            return {
                "session_id": session_id,
                "call_id": llm_call_id,
                "content": assistant_message.get("content", ""),
                "usage": usage,
                "latency_ms": latency_ms,
            }

        raise RuntimeError("Maximum tool-calling rounds exceeded")

    async def test_config(self, config: LLMConfig | None = None) -> dict[str, Any]:
        """Test LLM connectivity by sending a simple prompt."""
        candidate = config or self.config
        adapter = get_adapter(candidate)
        return await adapter.test_connection(candidate)

    @staticmethod
    def _disable_ssl_verification() -> None:
        """Disable SSL verification globally for all HTTP clients."""
        import ssl
        import warnings

        import urllib3

        ssl._create_default_https_context = ssl._create_unverified_context
        litellm.ssl_verify = False
        os.environ["SSL_CERT_FILE"] = ""
        os.environ["CURL_CA_BUNDLE"] = ""
        os.environ["REQUESTS_CA_BUNDLE"] = ""
        os.environ["AIOHTTP_NO_EXTENSIONS"] = "1"
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        warnings.filterwarnings("ignore", message="Unverified HTTPS request")
