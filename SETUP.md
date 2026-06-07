# Hermes Setup Guide

This guide walks through setting up Hermes from a clean machine with explicit dependency checks and clear error messages.

## Prerequisites

Hermes requires the following tools to be installed:

- **Python 3.9+** - Backend runtime
- **Node.js 18+** - Frontend build tooling
- **Rust/Cargo** - Tauri desktop shell
- **Xcode Command Line Tools** (macOS only)

## Quick Start

### 1. Check Dependencies

Run the dependency checker to validate your environment:

```bash
./scripts/check-deps.sh
```

This script will check for all required dependencies and provide clear installation instructions for anything missing.

### 2. One-Command Setup

If all dependencies are present, run:

```bash
make setup
```

This will:
- Create a Python virtual environment (.venv)
- Install Python dependencies
- Install npm dependencies
- Create hermes.local.json from the template

### 3. Start Hermes

```bash
make start
```

This launches both the FastAPI backend and the Tauri desktop app.

## Step-by-Step Setup

### Install System Dependencies

#### macOS

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python 3
brew install python3

# Install Node.js
brew install node

# Install Xcode Command Line Tools
xcode-select --install

# Install Rust
make setup-rust
# OR manually:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### Linux

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3 python3-pip python3-venv nodejs npm build-essential

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

#### Windows

1. Install [Python 3.9+](https://www.python.org/downloads/)
2. Install [Node.js 18+](https://nodejs.org/)
3. Install [Rust](https://rustup.rs/)
4. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)

### Setup Python Environment

```bash
make setup-python
```

This creates `.venv` and installs all Python dependencies.

### Setup Desktop Environment

```bash
make setup-desktop
```

This runs `npm install` in the desktop directory.

### Configure Hermes

The first time you run `make setup`, a `hermes.local.json` config file is created from `hermes.example.json`.

Edit this file to configure:
- LLM provider settings
- MCP server connections
- API keys (via environment variables)

## Makefile Commands

```bash
make check-deps           # Run dependency checker
make doctor              # Basic dependency check
make setup               # Full setup (Python + npm + config)
make setup-rust          # Install Rust toolchain
make setup-python        # Setup Python environment only
make setup-desktop       # Setup npm dependencies only
make start               # Start full stack (backend + desktop)
make start-backend       # Start backend only
make version             # Show current version
make set-version VERSION=x.y.z  # Update version everywhere
make package             # Build desktop app bundle
make package-backend     # Package Python backend
make clean               # Clean build artifacts
```

## Troubleshooting

### Port 8765 Already in Use

```bash
# Find the process using port 8765
lsof -i:8765 -P -n

# Kill it
kill -9 <PID>
```

### Python Virtual Environment Issues

```bash
# Remove existing venv and recreate
rm -rf .venv
make setup-python
```

### npm Installation Issues

```bash
# Clear npm cache
cd desktop
npm cache clean --force
rm -rf node_modules
npm install
```

### Rust/Cargo Not Found

```bash
# Ensure Rust is in PATH
export PATH="$HOME/.cargo/bin:$PATH"

# Or reinstall
make setup-rust
```

### macOS Xcode Tools Issues

```bash
# Remove and reinstall
sudo rm -rf /Library/Developer/CommandLineTools
xcode-select --install
```

## Logs and Diagnostics

Hermes logs are stored in `.hermes/logs/`:

- `hermes.log` - Main log file (JSON format)
- `hermes-errors.log` - Error log
- `startup-YYYYMMDD-HHMMSS.json` - Startup diagnostics

View logs:

```bash
# Follow main log
tail -f .hermes/logs/hermes.log

# View latest startup diagnostics
ls -t .hermes/logs/startup-*.json | head -1 | xargs cat | jq .
```

## Configuration

### LLM Provider Setup

Edit `hermes.local.json`:

```json
{
  "llm": {
    "provider": "litellm",
    "model": "openai/gpt-4",
    "api_base": "https://api.openai.com/v1",
    "api_key_env": "OPENAI_API_KEY"
  }
}
```

Set environment variables:

```bash
export OPENAI_API_KEY="sk-..."
```

### MCP Server Setup

Add MCP servers in `hermes.local.json`:

```json
{
  "mcp_servers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "enabled": true
    }
  }
}
```

## Development

### Backend Development

```bash
# Start backend only (no desktop)
make start-backend

# With custom port
make start-backend PORT=8080

# Backend runs on http://127.0.0.1:8765
```

### Frontend Development

```bash
cd desktop

# Build desktop assets
npm run build

# Run Tauri dev mode
npm run tauri:dev
```

### Testing

```bash
# Activate virtual environment
source .venv/bin/activate

# Run Python tests (if available)
pytest

# Run type checking
mypy .
```

## Next Steps

1. **Configure your LLM provider** in `hermes.local.json`
2. **Set up MCP servers** for tools you need
3. **Launch Hermes** with `make start`
4. **Check logs** if anything goes wrong

For more detailed documentation, see:
- [Architecture Overview](docs/architecture.md)
- [MCP Integration Guide](docs/mcp-integration.md)
- [API Documentation](docs/api.md)
