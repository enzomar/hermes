"""Local CLI adapter — runs LLM via subprocess (e.g., llama.cpp, ollama CLI)."""

from __future__ import annotations

import asyncio
import shlex
import shutil
from pathlib import Path
from time import perf_counter
from typing import Any

from config import LLMConfig
from core.event_bus import EventBus
from llm.providers.base import CompletionResult


class LocalCliAdapter:
    """Adapter that spawns a local process for LLM completion."""

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
        command = self._resolve_command(config)
        prompt = self._format_prompt(messages)
        args, use_stdin = self._build_args(config, prompt)
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

        return CompletionResult(
            assistant_message={"role": "assistant", "content": content, "tool_calls": None},
            usage=usage,
            latency_ms=latency_ms,
            finish_reason="stop",
        )

    async def test_connection(self, config: LLMConfig) -> dict[str, Any]:
        result = await self.complete(
            [{"role": "user", "content": "Reply with the single word OK."}],
            config,
        )
        return {
            "model": config.model or config.cli_command or "local-cli",
            "provider": config.provider,
            "latency_ms": result.latency_ms,
            "message": str(result.assistant_message.get("content") or "OK").strip() or "OK",
        }

    def _resolve_command(self, config: LLMConfig) -> str:
        if not config.cli_command:
            raise RuntimeError("Local CLI mode requires a command")
        expanded = Path(config.cli_command).expanduser()
        if expanded.is_file():
            return str(expanded)
        resolved = shutil.which(config.cli_command)
        if not resolved:
            raise RuntimeError(f"Local CLI command not found: {config.cli_command}")
        return resolved

    def _build_args(self, config: LLMConfig, prompt: str) -> tuple[list[str], bool]:
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

    def _format_prompt(self, messages: list[dict[str, Any]]) -> str:
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
