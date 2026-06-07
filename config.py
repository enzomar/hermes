from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


GITHUB_MODELS_API_BASE = "https://models.github.ai/inference"
DEFAULT_LLM_PROFILE_NAME = "Primary AI"


class LLMConfig(BaseModel):
    provider: Literal["openai", "anthropic", "groq", "mistral", "together", "perplexity", "openrouter", "google", "cohere", "fireworks", "deepseek", "local", "local-cli", "github-copilot"] = "openai"
    model: str = "openai/gpt-4.1-mini"
    api_base: str | None = None
    api_key_env: str | None = None
    custom_llm_provider: str | None = None  # For litellm routing (UI provides this)
    disable_tools: bool = False  # Disable MCP tool calling for this profile
    cli_command: str | None = None
    cli_args: list[str] = Field(default_factory=list)
    temperature: float = 0.2
    top_p: float | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    max_tokens: int = 2048
    timeout_seconds: float = 90.0
    system_prompt: str = (
        "You are Hermes, an MCP AI IDE workbench assistant. Be concise, prefer tools when they help, "
        "and report tool failures explicitly."
    )

    @model_validator(mode="before")
    @classmethod
    def normalize_provider_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        payload = dict(data)
        raw_provider = str(payload.get("provider") or "openai").strip().lower()
        model = str(payload.get("model") or "").strip().lower()
        api_base = str(payload.get("api_base") or "").strip()
        api_base_lower = api_base.lower()

        aliases = {
            "openai": "openai",
            "open api": "openai",
            "hosted": "openai",
            "anthropic": "anthropic",
            "claude": "anthropic",
            "groq": "groq",
            "mistral": "mistral",
            "mistralai": "mistral",
            "mistral-ai": "mistral",
            "mistral ai": "mistral",
            "together": "together",
            "togetherai": "together",
            "together-ai": "together",
            "together ai": "together",
            "perplexity": "perplexity",
            "perplexityai": "perplexity",
            "perplexity-ai": "perplexity",
            "openrouter": "openrouter",
            "open-router": "openrouter",
            "open router": "openrouter",
            "google": "google",
            "gemini": "google",
            "google-gemini": "google",
            "google gemini": "google",
            "cohere": "cohere",
            "command-r": "cohere",
            "fireworks": "fireworks",
            "fireworksai": "fireworks",
            "fireworks-ai": "fireworks",
            "fireworks ai": "fireworks",
            "deepseek": "deepseek",
            "deep-seek": "deepseek",
            "deep seek": "deepseek",
            "github-copilot": "github-copilot",
            "github copilot": "github-copilot",
            "github models": "github-copilot",
            "github-models": "github-copilot",
            "githubmodels": "github-copilot",
            "copilot": "github-copilot",
            "local": "local",
            "ollama": "local",
            "local-api": "local",
            "localai": "local",
            "local-cli": "local-cli",
            "localai-cli": "local-cli",
            "local-ai-cli": "local-cli",
        }

        if raw_provider == "litellm":
            raw_provider = "local" if api_base or model.startswith(("ollama/", "localai/", "gpt4all/")) else "openai"

        if raw_provider == "openai" and "models.github.ai" in api_base_lower:
            raw_provider = "github-copilot"

        normalized_provider = aliases.get(raw_provider, raw_provider)
        payload["provider"] = normalized_provider
        if normalized_provider == "github-copilot" and not str(payload.get("api_base") or "").strip():
            payload["api_base"] = GITHUB_MODELS_API_BASE
        return payload

    @model_validator(mode="after")
    def validate_local_cli(self) -> "LLMConfig":
        if self.provider == "local-cli" and not self.cli_command:
            raise ValueError("local-cli provider requires cli_command")
        return self


class MCPServerConfig(BaseModel):
    transport: Literal["stdio", "sse"]
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    url: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    timeout_seconds: float = 30.0
    enabled: bool = True


class AppConfig(BaseModel):
    database_path: str = ".hermes/hermes.db"
    skip_ssl_verify: bool = False  # Disable TLS verification (for corporate proxies)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    llm_profiles: dict[str, LLMConfig] = Field(default_factory=dict)
    default_llm_profile: str = DEFAULT_LLM_PROFILE_NAME
    mcp_servers: dict[str, MCPServerConfig] = Field(default_factory=dict)

    @model_validator(mode="after")
    def sync_llm_profiles(self) -> "AppConfig":
        self._sync_llm_profiles()
        return self

    @classmethod
    def load(cls, path: str | Path) -> "AppConfig":
        config_path = Path(path)
        data = json.loads(config_path.read_text(encoding="utf-8"))
        return cls.model_validate(data)

    def ensure_dirs(self, root: str | Path) -> Path:
        root_path = Path(root)
        database_path = root_path / self.database_path
        database_path.parent.mkdir(parents=True, exist_ok=True)
        return database_path

    def save(self, path: str | Path) -> None:
        config_path = Path(path)
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(f"{json.dumps(self.model_dump(), indent=2)}\n", encoding="utf-8")

    def set_llm_profiles(self, profiles: dict[str, LLMConfig], default_profile: str | None = None) -> None:
        self.llm_profiles = {str(name).strip(): config for name, config in profiles.items() if str(name).strip()}
        if default_profile is not None:
            cleaned_default = str(default_profile).strip()
            self.default_llm_profile = cleaned_default or DEFAULT_LLM_PROFILE_NAME
        self._sync_llm_profiles()

    def model_dump_public(self) -> dict[str, Any]:
        payload = self.model_dump()
        llm = payload.get("llm", {})
        if llm.get("api_key_env"):
            llm["api_key_present"] = True
        for profile in payload.get("llm_profiles", {}).values():
            if profile.get("api_key_env"):
                profile["api_key_present"] = True
        return payload

    def _sync_llm_profiles(self) -> None:
        cleaned_profiles = {
            str(name).strip(): config
            for name, config in self.llm_profiles.items()
            if str(name).strip()
        }
        default_name = str(self.default_llm_profile or DEFAULT_LLM_PROFILE_NAME).strip() or DEFAULT_LLM_PROFILE_NAME

        if not cleaned_profiles:
            cleaned_profiles[default_name] = self.llm

        if default_name not in cleaned_profiles:
            active_profile_name = next(
                (
                    name
                    for name, config in cleaned_profiles.items()
                    if config.model_dump() == self.llm.model_dump()
                ),
                None,
            )
            if active_profile_name:
                default_name = active_profile_name
            else:
                cleaned_profiles[default_name] = self.llm

        self.llm_profiles = cleaned_profiles
        self.default_llm_profile = default_name
        self.llm = cleaned_profiles[default_name]
