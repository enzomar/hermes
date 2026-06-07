"""Secure local keystore for API keys and secrets.

Keys are encrypted at rest using Fernet symmetric encryption.
The encryption key is derived from a machine-specific seed (machine ID + app salt)
stored separately from the encrypted data.

Usage:
    from core.keystore import Keystore

    ks = Keystore()
    ks.set("OPENAI_API_KEY", "sk-abc123...")
    key = ks.get("OPENAI_API_KEY")
    ks.delete("OPENAI_API_KEY")
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import platform
import uuid
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


def _get_machine_seed() -> bytes:
    """Derive a stable machine-specific seed for key derivation."""
    parts = [
        platform.node(),
        str(uuid.getnode()),  # MAC address as int
        os.getenv("USER", os.getenv("USERNAME", "hermes")),
    ]
    raw = "|".join(parts).encode("utf-8")
    return raw


def _derive_fernet_key(seed: bytes, salt: bytes) -> bytes:
    """Derive a 32-byte Fernet key from seed + salt via SHA-256."""
    derived = hashlib.pbkdf2_hmac("sha256", seed, salt, iterations=100_000)
    return base64.urlsafe_b64encode(derived)


class Keystore:
    """Encrypted local keystore for API secrets."""

    def __init__(self, base_dir: Path | str | None = None) -> None:
        if base_dir is None:
            base_dir = Path.cwd() / ".hermes"
        self._base_dir = Path(base_dir)
        self._store_path = self._base_dir / "keystore.enc"
        self._salt_path = self._base_dir / "keystore.salt"
        self._fernet: Fernet | None = None
        self._cache: dict[str, str] = {}
        self._loaded = False

    def _ensure_dir(self) -> None:
        self._base_dir.mkdir(parents=True, exist_ok=True)

    def _get_fernet(self) -> Fernet:
        if self._fernet is not None:
            return self._fernet

        self._ensure_dir()

        # Load or create salt
        if self._salt_path.exists():
            salt = self._salt_path.read_bytes()
        else:
            salt = os.urandom(32)
            self._salt_path.write_bytes(salt)
            # Restrict permissions (best-effort on non-Unix)
            try:
                self._salt_path.chmod(0o600)
            except OSError:
                pass

        seed = _get_machine_seed()
        key = _derive_fernet_key(seed, salt)
        self._fernet = Fernet(key)
        return self._fernet

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True

        if not self._store_path.exists():
            self._cache = {}
            return

        fernet = self._get_fernet()
        try:
            encrypted = self._store_path.read_bytes()
            decrypted = fernet.decrypt(encrypted)
            self._cache = json.loads(decrypted.decode("utf-8"))
        except (InvalidToken, json.JSONDecodeError, OSError):
            # Corrupted store — start fresh
            self._cache = {}

    def _save(self) -> None:
        self._ensure_dir()
        fernet = self._get_fernet()
        payload = json.dumps(self._cache, separators=(",", ":")).encode("utf-8")
        encrypted = fernet.encrypt(payload)
        self._store_path.write_bytes(encrypted)
        try:
            self._store_path.chmod(0o600)
        except OSError:
            pass

    def get(self, name: str) -> str | None:
        """Retrieve a secret by name. Returns None if not found."""
        self._load()
        return self._cache.get(name)

    def set(self, name: str, value: str) -> None:
        """Store a secret. Overwrites if it already exists."""
        self._load()
        self._cache[name] = value
        self._save()

    def delete(self, name: str) -> bool:
        """Delete a secret. Returns True if it existed."""
        self._load()
        if name not in self._cache:
            return False
        del self._cache[name]
        self._save()
        return True

    def list_names(self) -> list[str]:
        """List all stored secret names (not values)."""
        self._load()
        return sorted(self._cache.keys())

    def has(self, name: str) -> bool:
        """Check if a secret exists."""
        self._load()
        return name in self._cache

    def resolve(self, name_or_value: str) -> str | None:
        """Resolve a key: check keystore first, then env var, then treat as raw key.

        This is the primary method the LLM engine should use.
        Priority:
          1. Keystore lookup by name
          2. Environment variable lookup by name
          3. If it looks like a raw key (has lowercase, special chars, known prefix), use directly
        """
        if not name_or_value:
            return None

        value = name_or_value.strip()

        # 1. Check keystore
        stored = self.get(value)
        if stored:
            return stored

        # 2. Check environment variable
        env_val = os.getenv(value)
        if env_val:
            return env_val

        # 3. If it looks like a raw key, return it directly
        if _looks_like_raw_key(value):
            return value

        return None


def _looks_like_raw_key(value: str) -> bool:
    """Detect if a value is an actual API key vs a reference name."""
    if value.startswith(("sk-", "ghp_", "ghu_", "ghs_", "github_pat_", "key-", "Bearer ", "xai-")):
        return True
    if any(c.islower() for c in value) and len(value) > 20:
        return True
    if any(c in value for c in "-/+="):
        return True
    return False
