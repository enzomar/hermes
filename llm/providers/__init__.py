"""LLM Provider Adapter registry.

Maps provider names to adapter implementations.
All adapters satisfy the ProviderAdapter protocol defined in base.py.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from config import LLMConfig

if TYPE_CHECKING:
    from llm.providers.base import ProviderAdapter


def get_adapter(config: LLMConfig) -> "ProviderAdapter":
    """Return the appropriate adapter for the given config."""
    from llm.providers.github_models import GitHubModelsAdapter
    from llm.providers.litellm_adapter import LitellmAdapter
    from llm.providers.local_cli import LocalCliAdapter

    if config.provider == "local-cli":
        return LocalCliAdapter()
    if config.provider == "github-copilot":
        return GitHubModelsAdapter()
    return LitellmAdapter()
