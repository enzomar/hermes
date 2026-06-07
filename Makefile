SHELL := /bin/sh

.DEFAULT_GOAL := help

ifeq ($(OS),Windows_NT)
VENV_BIN := .venv/Scripts
PYTHON := $(VENV_BIN)/python.exe
PIP := $(PYTHON) -m pip
NPM := npm.cmd
RUN_IN_VENV := PATH="$(abspath $(VENV_BIN));$$PATH"
CARGO_BIN := $(USERPROFILE)/.cargo/bin
RUST_PATH := $(CARGO_BIN)
RUN_DESKTOP := PATH="$(abspath $(VENV_BIN));$(RUST_PATH);$$PATH"
else
VENV_BIN := .venv/bin
PYTHON := $(VENV_BIN)/python
PIP := $(PYTHON) -m pip
NPM := npm
RUN_IN_VENV := PATH="$(abspath $(VENV_BIN)):$$PATH"
CARGO_BIN := $(HOME)/.cargo/bin
RUST_PATH := $(CARGO_BIN):/opt/homebrew/opt/rustup/bin:/usr/local/opt/rustup/bin
RUN_DESKTOP := PATH="$(abspath $(VENV_BIN)):$(RUST_PATH):$$PATH"
endif

PYTHON_BOOTSTRAP ?= python3
CONFIG ?= hermes.local.json
HOST ?= 127.0.0.1
PORT ?= 8765
CURRENT_VERSION := $(shell sed -n 's/^version = "\(.*\)"/\1/p' pyproject.toml | head -1)
VERSION ?= $(CURRENT_VERSION)
PYTHON_READY := .venv/.deps-installed
NPM_READY := desktop/node_modules/.install-stamp

.PHONY: help doctor check-deps setup-rust setup setup-python setup-desktop start start-backend version set-version package package-backend clean

help:
	@printf '%s\n' \
	  'Hermes Make targets:' \
	  '  make check-deps            Run comprehensive dependency check with clear error messages' \
	  '  make doctor                Check required system tools for the desktop workflow' \
	  '  make setup-rust            Install the Rust toolchain needed by the Tauri desktop shell' \
	  '  make setup                 Create .venv, install Python deps, install desktop deps, seed local config' \
	  '  make start                 Launch the full Tauri development stack' \
	  '  make start-backend         Launch only the FastAPI backend' \
	  '  make version               Print the current project version' \
	  '  make set-version VERSION=x.y.z' \
	  '                             Sync version across pyproject, desktop package, Cargo, and tauri config' \
	  '  make package VERSION=x.y.z' \
	  '                             Sync version (if provided) and build the desktop app bundle' \
	  '  make package-backend VERSION=x.y.z' \
	  '                             Sync version (if provided) and package only the Python sidecar'

check-deps:
	@HERMES_API_PORT="$(PORT)" ./scripts/check-deps.sh

doctor:
	@command -v $(PYTHON_BOOTSTRAP) >/dev/null 2>&1 || { \
		printf '%s\n' 'python3 is required but was not found on PATH.' >&2; \
		exit 1; \
	}
	@command -v $(NPM) >/dev/null 2>&1 || { \
		printf '%s\n' 'npm is required but was not found on PATH.' >&2; \
		exit 1; \
	}
	@if ! PATH="$(RUST_PATH):$$PATH" command -v cargo >/dev/null 2>&1; then \
		printf '%s\n' 'cargo is required for the Tauri desktop shell but was not found on PATH.' >&2; \
		printf '%s\n' 'Run `make setup-rust` to install it.' >&2; \
		exit 1; \
	fi
	@if [ "$$(uname -s)" = 'Darwin' ] && ! xcode-select -p >/dev/null 2>&1; then \
		printf '%s\n' 'Xcode Command Line Tools are required on macOS.' >&2; \
		printf '%s\n' 'Install them with: xcode-select --install' >&2; \
		exit 1; \
	fi
	@printf '%s\n' 'Desktop prerequisites look good.'

setup-rust:
	@if [ "$$(uname -s)" = 'Darwin' ] && ! xcode-select -p >/dev/null 2>&1; then \
		printf '%s\n' 'Xcode Command Line Tools are required on macOS.' >&2; \
		printf '%s\n' 'Install them with: xcode-select --install' >&2; \
		exit 1; \
	fi
	@if PATH="$(RUST_PATH):$$PATH" command -v cargo >/dev/null 2>&1; then \
		printf '%s\n' 'Rust is already installed:'; \
		PATH="$(RUST_PATH):$$PATH" cargo --version; \
		exit 0; \
	fi
	@if ! command -v rustup >/dev/null 2>&1; then \
		if command -v brew >/dev/null 2>&1; then \
			brew install rustup; \
		else \
			printf '%s\n' 'rustup was not found and Homebrew is unavailable.' >&2; \
			printf '%s\n' 'Install Rust manually from https://rustup.rs and retry.' >&2; \
			exit 1; \
		fi; \
	fi
	@rustup set profile minimal
	@rustup default stable
	@PATH="$(RUST_PATH):$$PATH" cargo --version
	@PATH="$(RUST_PATH):$$PATH" rustc --version
	@printf '%s\n' 'Rust toolchain installed. `make start` will now pick up cargo from $(RUST_PATH).'

$(PYTHON):
	$(PYTHON_BOOTSTRAP) -m venv .venv

setup: $(PYTHON_READY) $(NPM_READY) $(CONFIG)


setup-python: $(PYTHON_READY)

$(PYTHON_READY): $(PYTHON) pyproject.toml
	$(PIP) install --upgrade pip
	$(PIP) install -e '.[dev]'
	touch $(PYTHON_READY)


setup-desktop: $(NPM_READY)

$(NPM_READY): desktop/package.json
	cd desktop && $(NPM) install
	touch $(NPM_READY)

$(CONFIG): hermes.example.json
	@if [ ! -f "$(CONFIG)" ]; then \
		cp hermes.example.json "$(CONFIG)"; \
		printf 'Created %s from hermes.example.json\n' "$(CONFIG)"; \
	fi

start: check-deps $(PYTHON_READY) $(NPM_READY) $(CONFIG)
	cd desktop && $(RUN_DESKTOP) HERMES_API_HOST="$(HOST)" HERMES_API_PORT="$(PORT)" $(NPM) run tauri:dev

start-backend: $(PYTHON_READY) $(CONFIG)
	@RESOLVED_PORT="$$($(PYTHON) - <<-'PY'
	from __future__ import annotations

	import contextlib
	import os
	import socket

	host = os.environ["HERMES_HOST"]
	preferred = int(os.environ["HERMES_PORT"])

	for port in range(preferred, preferred + 25):
	    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as candidate:
	        candidate.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
	        try:
	            candidate.bind((host, port))
	        except OSError:
	            continue
	        print(port)
	        break
	else:
	    raise SystemExit(f"No free backend port found starting at {preferred}")
	PY
	HERMES_HOST="$(HOST)" HERMES_PORT="$(PORT)")"; \
	printf 'Starting Hermes backend on http://%s:%s\n' "$(HOST)" "$$RESOLVED_PORT"; \
	$(PYTHON) main.py --config $(CONFIG) --workspace . --host $(HOST) --port "$$RESOLVED_PORT"

version:
	@printf '%s\n' '$(CURRENT_VERSION)'

set-version:
	@if [ -z "$(VERSION)" ]; then \
		printf '%s\n' 'VERSION is required, for example: make set-version VERSION=0.1.1' >&2; \
		exit 1; \
	fi
	@VERSION='$(VERSION)' python3 - <<-'PY'
	from __future__ import annotations
	
	import json
	import os
	import pathlib
	import re
	
	version = os.environ["VERSION"]
	root = pathlib.Path.cwd()
	
	pyproject = root / "pyproject.toml"
	pyproject_text = pyproject.read_text(encoding="utf-8")
	pyproject_text, count = re.subn(
	    r'(?m)^version = ".*"$$',
	    f'version = "{version}"',
	    pyproject_text,
	    count=1,
	)
	if count != 1:
	    raise SystemExit("Could not update version in pyproject.toml")
	pyproject.write_text(pyproject_text, encoding="utf-8")
	
	package_json = root / "desktop" / "package.json"
	package_data = json.loads(package_json.read_text(encoding="utf-8"))
	package_data["version"] = version
	package_json.write_text(json.dumps(package_data, indent=2) + "\n", encoding="utf-8")
	
	tauri_conf = root / "desktop" / "src-tauri" / "tauri.conf.json"
	tauri_data = json.loads(tauri_conf.read_text(encoding="utf-8"))
	tauri_data["version"] = version
	tauri_conf.write_text(json.dumps(tauri_data, indent=2) + "\n", encoding="utf-8")
	
	cargo = root / "desktop" / "src-tauri" / "Cargo.toml"
	cargo_text = cargo.read_text(encoding="utf-8")
	cargo_text, count = re.subn(
	    r'(?m)^version = ".*"$$',
	    f'version = "{version}"',
	    cargo_text,
	    count=1,
	)
	if count != 1:
	    raise SystemExit("Could not update version in desktop/src-tauri/Cargo.toml")
	cargo.write_text(cargo_text, encoding="utf-8")
	
	print(f"Updated project version to {version}")
	PY

package-backend: $(PYTHON_READY) $(NPM_READY)
	@if [ "$(VERSION)" != "$(CURRENT_VERSION)" ]; then \
		$(MAKE) set-version VERSION=$(VERSION); \
	fi
	cd desktop && $(RUN_IN_VENV) $(NPM) run package:backend

package: doctor $(PYTHON_READY) $(NPM_READY)
	@if [ "$(VERSION)" != "$(CURRENT_VERSION)" ]; then \
		$(MAKE) set-version VERSION=$(VERSION); \
	fi
	cd desktop && $(RUN_DESKTOP) $(NPM) run tauri:build

clean:
	rm -rf build dist .pytest_cache .ruff_cache
	rm -rf desktop/dist desktop/src-tauri/target