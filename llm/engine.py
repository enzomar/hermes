from __future__ import annotations

import asyncio
import os
import shlex
import shutil
from pathlib import Path
from time import perf_counter
from typing import Any
from uuid import uuid4

import litellm
from litellm import acompletion
from openai import AsyncOpenAI

from config import LLMConfig
from core.event_bus import EventBus
from core.event_model import EventType
from llm.streaming import StreamAccumulator
from llm.tool_bridge import ToolBridge


GITHUB_MODELS_API_BASE = "https://models.github.ai/inference"
GITHUB_MODELS_API_VERSION = "2026-03-10"

# Default API base URLs per provider (used when api_base is not explicitly set)
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
    "github-copilot": GITHUB_MODELS_API_BASE,
}


def _looks_like_raw_key(value: str) -> bool:
    """Detect if a value is an actual API key vs an env var name.

    Env var names are UPPER_SNAKE_CASE with no special chars.
    Raw keys have lowercase, hyphens, long lengths, or known prefixes.
    """
    # Known key prefixes
    if value.startswith(("sk-", "ghp_", "ghu_", "ghs_", "github_pat_", "key-", "Bearer ")):
        return True
    # If it contains lowercase and is longer than typical env var names
    if any(c.islower() for c in value) and len(value) > 20:
        return True
    # If it contains characters invalid in env var names
    if any(c in value for c in "-/+="):
        return True
    return False


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

        # Pre-flight: ensure API key is available before attempting LLM calls
        if not self._uses_local_cli(starting_config):
            resolved_key = self._api_key(starting_config)
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

            if messages and messages[0].get("role") == "system":
                messages[0] = {"role": "system", "content": config.system_prompt}
            else:
                messages.insert(0, {"role": "system", "content": config.system_prompt})

            llm_call_id = str(uuid4())
            tools = [] if self._uses_local_cli(config) else self.tool_bridge.llm_tools()
            
            # Allow per-profile tool disabling
            if getattr(config, "disable_tools", False):
                tools = []
            
            await self.bus.publish(
                EventType.LLM_START,
                session_id,
                {
                    "call_id": llm_call_id,
                    "model": config.model,
                    "tool_count": len(tools),
                },
            )

            try:
                if self._uses_local_cli(config):
                    response = await self._run_local_cli_completion(messages, config)
                    assistant_message = response["assistant_message"]
                    usage = response["usage"]
                    latency_ms = response["latency_ms"]
                    finish_reason = "stop"
                elif config.provider == "github-copilot":
                    # GitHub Models: Use OpenAI SDK directly
                    response = await self._run_github_models_completion(messages, config, tools, session_id, llm_call_id)
                    assistant_message = response["assistant_message"]
                    usage = response["usage"]
                    latency_ms = response["latency_ms"]
                    finish_reason = response.get("finish_reason", "stop")
                else:
                    started = perf_counter()
                    accumulator = StreamAccumulator()
                    
                    # Use litellm model name with provider prefix
                    model_name = self._litellm_model_name(config)
                    
                    stream = await acompletion(
                        model=model_name,
                        messages=messages,
                        tools=tools or None,
                        tool_choice="auto" if tools else None,
                        stream=True,
                        stream_options={"include_usage": True},
                        max_tokens=config.max_tokens,
                        **self._api_completion_kwargs(config),
                    )

                    async for chunk in stream:
                        for token in accumulator.ingest(chunk):
                            await self.bus.publish(
                                EventType.LLM_TOKEN,
                                session_id,
                                {"call_id": llm_call_id, "text": token},
                            )

                    assistant_message = accumulator.assistant_message()
                    usage = accumulator.usage or {}
                    latency_ms = (perf_counter() - started) * 1000
                    finish_reason = accumulator.finish_reason
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
        candidate = config or self.config
        if self._uses_local_cli(candidate):
            response = await self._run_local_cli_completion(
                [{"role": "user", "content": "Reply with the single word OK."}],
                candidate,
            )
            return {
                "model": candidate.model or candidate.cli_command or "local-cli",
                "provider": candidate.provider,
                "latency_ms": response["latency_ms"],
                "message": str(response["assistant_message"].get("content") or "OK").strip() or "OK",
            }

        # Pre-flight: check API key is available
        resolved_key = self._api_key(candidate)
        if not resolved_key and candidate.api_key_env:
            raise RuntimeError(
                f"API key environment variable '{candidate.api_key_env}' is not set. "
                f"Export it before starting Hermes: export {candidate.api_key_env}=your-key"
            )
        if not resolved_key and candidate.provider != "local":
            raise RuntimeError(
                "No API key configured. Set the 'API Key Env Variable' field to the name of "
                "an environment variable that holds your API key (e.g. OPENAI_API_KEY, GITHUB_TOKEN)."
            )

        started = perf_counter()
        # GitHub Models: Use OpenAI SDK directly (litellm doesn't support it)
        if candidate.provider == "github-copilot":
            return await self._test_github_models(candidate)
        
        # Standard providers: use litellm
        model_name = self._litellm_model_name(candidate)
        completion_kwargs = self._api_completion_kwargs(candidate, temperature=0, timeout=min(candidate.timeout_seconds, 20))
        
        import logging
        logging.getLogger(__name__).info(f"LiteLLM test: original={candidate.model} → resolved={model_name}, provider={candidate.provider}")
        
        response = await acompletion(
            model=model_name,
            messages=[{"role": "user", "content": "Reply with the single word OK."}],
            stream=False,
            max_tokens=max(1, min(candidate.max_tokens, 12)),
            **completion_kwargs,
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
            "model": candidate.model,
            "provider": candidate.provider,
            "latency_ms": latency_ms,
            "message": message or "OK",
        }

    async def _test_github_models(self, config: LLMConfig) -> dict[str, Any]:
        """Test GitHub Models using OpenAI SDK directly (litellm doesn't support it)."""
        api_key = self._api_key(config)
        if not api_key:
            raise RuntimeError("GitHub PAT is required. Set api_key_env to your GitHub personal access token.")
        
        # GitHub Models base should NOT include /v1 (it uses /inference/chat/completions directly)
        api_base = self._api_base(config) or GITHUB_MODELS_API_BASE
        
        import logging
        import httpx
        logger = logging.getLogger(__name__)
        logger.info(f"GitHub Models test: base_url={api_base}, model={config.model}, pat={api_key[:10]}...")
        
        try:
            # Create httpx client with SSL verification disabled (for corporate proxies)
            http_client = httpx.AsyncClient(verify=False)
            
            client = AsyncOpenAI(
                api_key=api_key,
                base_url=api_base,
                http_client=http_client,
                default_headers={
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION,
                },
                timeout=min(config.timeout_seconds, 20),
            )
            
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
        except Exception as e:
            logger.error(f"GitHub Models test failed: {type(e).__name__}: {e}")
            raise

    async def _run_github_models_completion(
        self,
        messages: list[dict[str, Any]],
        config: LLMConfig,
        tools: list[dict[str, Any]] | None,
        session_id: str,
        llm_call_id: str,
    ) -> dict[str, Any]:
        """Run completion using OpenAI SDK directly for GitHub Models with streaming."""
        api_key = self._api_key(config)
        if not api_key:
            raise RuntimeError("GitHub PAT is required.")
        
        api_base = self._api_base(config) or GITHUB_MODELS_API_BASE
        
        import httpx
        # Create httpx client with SSL verification disabled (for corporate proxies)
        http_client = httpx.AsyncClient(verify=False)
        
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=api_base,
            http_client=http_client,
            default_headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION,
            },
            timeout=config.timeout_seconds,
        )
        
        started = perf_counter()
        
        # Build completion kwargs
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
        
        # Only include tools if we have them
        if tools:
            create_kwargs["tools"] = tools
            create_kwargs["tool_choice"] = "auto"
        
        # Stream the response
        stream = await client.chat.completions.create(**create_kwargs)  # type: ignore
        
        # Accumulate streaming response
        content = ""
        tool_calls_dict: dict[int, dict[str, Any]] = {}
        finish_reason = None
        usage_data = None
        
        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if not delta:
                continue
            
            # Handle content tokens
            if delta.content:
                content += delta.content
                # Emit token event for UI streaming
                await self.bus.publish(
                    EventType.LLM_TOKEN,
                    session_id,
                    {"call_id": llm_call_id, "text": delta.content},
                )
            
            # Handle tool calls
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
            
            # Handle finish reason
            if chunk.choices and chunk.choices[0].finish_reason:
                finish_reason = chunk.choices[0].finish_reason
            
            # Handle usage (sent at the end with stream_options)
            if hasattr(chunk, "usage") and chunk.usage:
                usage_data = chunk.usage
        
        latency_ms = (perf_counter() - started) * 1000
        
        tool_calls = [tool_calls_dict[i] for i in sorted(tool_calls_dict.keys())] if tool_calls_dict else None
        
        usage = {
            "prompt_tokens": usage_data.prompt_tokens if usage_data else 0,
            "completion_tokens": usage_data.completion_tokens if usage_data else 0,
            "total_tokens": usage_data.total_tokens if usage_data else 0,
        }
        
        return {
            "assistant_message": {
                "role": "assistant",
                "content": content,
                "tool_calls": tool_calls,
            },
            "usage": usage,
            "latency_ms": latency_ms,
            "finish_reason": finish_reason or "stop",
        }

    def _uses_local_cli(self, config: LLMConfig | None = None) -> bool:
        candidate = config or self.config
        return candidate.provider == "local-cli"

    @staticmethod
    def _disable_ssl_verification() -> None:
        """Disable SSL verification globally for all HTTP clients."""
        import ssl
        import certifi
        
        # Disable for Python's built-in SSL
        ssl._create_default_https_context = ssl._create_unverified_context
        
        # Disable for litellm
        litellm.ssl_verify = False
        
        # Disable for httpx (used by openai SDK)
        os.environ["SSL_CERT_FILE"] = ""
        os.environ["CURL_CA_BUNDLE"] = ""
        os.environ["REQUESTS_CA_BUNDLE"] = ""
        
        # Disable for aiohttp (used by litellm internally)
        os.environ["AIOHTTP_NO_EXTENSIONS"] = "1"
        
        # Suppress urllib3 InsecureRequestWarning
        import warnings
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        warnings.filterwarnings("ignore", message="Unverified HTTPS request")

    def _litellm_model_name(self, config: LLMConfig) -> str:
        """Build litellm-compatible model name with provider prefix."""
        model = config.model
        # If model already has a provider prefix (contains /), check if it matches
        # Known litellm prefixes that need explicit routing
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
        prefix = PROVIDER_PREFIX.get(config.provider, "")
        if not prefix:
            return model
        # Don't double-prefix
        if model.startswith(prefix):
            return model
        return f"{prefix}{model}"

    def _api_completion_kwargs(self, config: LLMConfig, **overrides: Any) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "temperature": config.temperature,
            "api_base": self._api_base(config),
            "api_key": self._api_key(config),
            "timeout": config.timeout_seconds,
        }
        
        # If UI provided custom_llm_provider, use it (e.g., "openai" for GitHub Models)
        if config.custom_llm_provider:
            kwargs["custom_llm_provider"] = config.custom_llm_provider
        
        # For github-copilot, also set OPENAI_API_KEY in env for litellm compatibility
        if config.provider == "github-copilot":
            resolved = self._api_key(config)
            if resolved:
                os.environ["OPENAI_API_KEY"] = resolved
        
        extra_headers = self._api_headers(config)
        if extra_headers:
            kwargs["extra_headers"] = extra_headers
        if config.top_p is not None:
            kwargs["top_p"] = config.top_p
        if config.presence_penalty is not None:
            kwargs["presence_penalty"] = config.presence_penalty
        if config.frequency_penalty is not None:
            kwargs["frequency_penalty"] = config.frequency_penalty
        kwargs.update(overrides)
        return kwargs

    async def _run_local_cli_completion(self, messages: list[dict[str, Any]], config: LLMConfig) -> dict[str, Any]:
        command = self._resolve_cli_command(config)
        prompt = self._format_cli_prompt(messages)
        args, use_stdin = self._build_cli_args(config, prompt)
        started = perf_counter()

        process = await asyncio.create_subprocess_exec(
            command,
            *args,
            stdin=asyncio.subprocess.PIPE if use_stdin else None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            process.communicate(prompt.encode("utf-8") if use_stdin else None),
            timeout=config.timeout_seconds,
        )
        latency_ms = (perf_counter() - started) * 1000

        if process.returncode != 0:
            detail = stderr.decode("utf-8", errors="replace").strip() or stdout.decode("utf-8", errors="replace").strip()
            raise RuntimeError(detail or f"Local CLI exited with code {process.returncode}")

        content = stdout.decode("utf-8", errors="replace").strip()
        usage = self._estimate_usage(prompt, content)
        return {
            "assistant_message": {"role": "assistant", "content": content, "tool_calls": None},
            "usage": usage,
            "latency_ms": latency_ms,
        }

    def _resolve_cli_command(self, config: LLMConfig) -> str:
        if not config.cli_command:
            raise RuntimeError("Local CLI mode requires a command")

        expanded = Path(config.cli_command).expanduser()
        if expanded.is_file():
            return str(expanded)

        resolved = shutil.which(config.cli_command)
        if not resolved:
            raise RuntimeError(f"Local CLI command not found: {config.cli_command}")
        return resolved

    def _build_cli_args(self, config: LLMConfig, prompt: str) -> tuple[list[str], bool]:
        args = [arg for arg in config.cli_args if arg.strip()]
        if config.model:
            has_model_flag = any(arg in {"--model", "-m"} for arg in args)
            if not has_model_flag:
                args = ["--model", config.model, *args]

        use_stdin = True
        rendered_args: list[str] = []
        for arg in args:
            if "{prompt}" in arg:
                use_stdin = False
            rendered_args.append(arg.replace("{prompt}", prompt))

        return rendered_args, use_stdin

    def _format_cli_prompt(self, messages: list[dict[str, Any]]) -> str:
        rendered: list[str] = []
        for message in messages:
            role = str(message.get("role") or "user").strip().lower()
            content = str(message.get("content") or "").strip()
            if not content:
                continue

            if role == "system":
                rendered.append(f"System:\n{content}")
            elif role == "assistant":
                rendered.append(f"Assistant:\n{content}")
            elif role == "tool":
                tool_name = str(message.get("name") or "tool").strip() or "tool"
                rendered.append(f"Tool ({tool_name}):\n{content}")
            else:
                rendered.append(f"User:\n{content}")
        return "\n\n".join(rendered)

    def _estimate_usage(self, prompt: str, content: str) -> dict[str, int]:
        prompt_tokens = max(1, int(len(shlex.split(prompt)) * 1.35)) if prompt.strip() else 0
        completion_tokens = max(1, int(len(shlex.split(content)) * 1.35)) if content.strip() else 0
        return {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        }

    def _api_key(self, config: LLMConfig | None = None) -> str | None:
        candidate = config or self.config
        if not candidate.api_key_env:
            return None
        value = candidate.api_key_env.strip()
        # Use keystore resolution: keystore → env var → raw key detection
        return self.keystore.resolve(value)

    def _api_base(self, config: LLMConfig | None = None) -> str | None:
        candidate = config or self.config
        if candidate.api_base:
            return candidate.api_base
        return PROVIDER_DEFAULT_API_BASE.get(candidate.provider)

    def _api_headers(self, config: LLMConfig | None = None) -> dict[str, str] | None:
        candidate = config or self.config
        if candidate.provider != "github-copilot":
            return None
        return {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": GITHUB_MODELS_API_VERSION,
        }
