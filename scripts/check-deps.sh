#!/usr/bin/env bash
# Hermes Dependency Checker
# Validates all required dependencies with clear error messages

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

log_info() {
    printf "${BLUE}[INFO]${NC} %s\n" "$1"
}

log_success() {
    printf "${GREEN}[✓]${NC} %s\n" "$1"
}

log_warning() {
    printf "${YELLOW}[⚠]${NC} %s\n" "$1"
    WARNINGS=$((WARNINGS + 1))
}

log_error() {
    printf "${RED}[✗]${NC} %s\n" "$1" >&2
    ERRORS=$((ERRORS + 1))
}

check_command() {
    local cmd=$1
    local name=$2
    local install_hint=$3

    if command -v "$cmd" >/dev/null 2>&1; then
        local version
        version=$($cmd --version 2>&1 | head -1 || echo "unknown")
        log_success "$name found: $version"
        return 0
    else
        log_error "$name not found"
        log_error "  Install: $install_hint"
        return 1
    fi
}

check_python_version() {
    log_info "Checking Python version..."

    if ! command -v python3 >/dev/null 2>&1; then
        log_error "python3 not found"
        log_error "  Install: https://www.python.org/downloads/ or brew install python3"
        return 1
    fi

    local py_version
    py_version=$(python3 --version 2>&1 | awk '{print $2}')
    local major minor
    major=$(echo "$py_version" | cut -d. -f1)
    minor=$(echo "$py_version" | cut -d. -f2)

    if [ "$major" -lt 3 ] || ([ "$major" -eq 3 ] && [ "$minor" -lt 9 ]); then
        log_error "Python $py_version found, but 3.9+ required"
        return 1
    fi

    log_success "Python $py_version"
    return 0
}

check_node_version() {
    log_info "Checking Node.js version..."

    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js not found"
        log_error "  Install: https://nodejs.org/ or brew install node"
        return 1
    fi

    local node_version
    node_version=$(node --version | sed 's/v//')
    local major
    major=$(echo "$node_version" | cut -d. -f1)

    if [ "$major" -lt 18 ]; then
        log_error "Node.js $node_version found, but 18+ required"
        return 1
    fi

    log_success "Node.js $node_version"
    return 0
}

check_rust() {
    log_info "Checking Rust toolchain..."

    # Check common Rust locations
    local rust_paths=(
        "$HOME/.cargo/bin"
        "/opt/homebrew/opt/rustup/bin"
        "/usr/local/opt/rustup/bin"
    )

    local found=0
    for rust_path in "${rust_paths[@]}"; do
        if [ -d "$rust_path" ]; then
            export PATH="$rust_path:$PATH"
            if command -v cargo >/dev/null 2>&1; then
                found=1
                break
            fi
        fi
    done

    if [ $found -eq 0 ] || ! command -v cargo >/dev/null 2>&1; then
        log_error "Rust/Cargo not found"
        log_error "  Install: make setup-rust OR curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        return 1
    fi

    local cargo_version rust_version
    cargo_version=$(cargo --version 2>&1 | head -1)
    rust_version=$(rustc --version 2>&1 | head -1)
    log_success "Cargo: $cargo_version"
    log_success "Rustc: $rust_version"
    return 0
}

check_macos_dependencies() {
    if [ "$(uname -s)" != "Darwin" ]; then
        return 0
    fi

    log_info "Checking macOS dependencies..."

    if ! xcode-select -p >/dev/null 2>&1; then
        log_error "Xcode Command Line Tools not installed"
        log_error "  Install: xcode-select --install"
        return 1
    fi

    log_success "Xcode Command Line Tools installed"
    return 0
}

check_virtual_env() {
    log_info "Checking Python virtual environment..."

    if [ ! -d ".venv" ]; then
        log_warning "Python virtual environment not created"
        log_warning "  Run: make setup-python"
        return 0
    fi

    if [ ! -f ".venv/.deps-installed" ]; then
        log_warning "Python dependencies not installed"
        log_warning "  Run: make setup-python"
        return 0
    fi

    log_success "Python virtual environment ready"
    return 0
}

check_npm_deps() {
    log_info "Checking npm dependencies..."

    if [ ! -d "desktop/node_modules" ]; then
        log_warning "npm dependencies not installed"
        log_warning "  Run: make setup-desktop"
        return 0
    fi

    if [ ! -f "desktop/node_modules/.install-stamp" ]; then
        log_warning "npm install incomplete"
        log_warning "  Run: make setup-desktop"
        return 0
    fi

    log_success "npm dependencies ready"
    return 0
}

check_config_file() {
    log_info "Checking configuration file..."

    local config_file="hermes.local.json"

    if [ ! -f "$config_file" ]; then
        log_warning "Config file '$config_file' not found"
        if [ -f "hermes.example.json" ]; then
            log_warning "  Run: cp hermes.example.json $config_file"
        else
            log_error "hermes.example.json template not found"
            return 1
        fi
        return 0
    fi

    # Validate JSON syntax
    if command -v python3 >/dev/null 2>&1; then
        if python3 -c "import json; json.load(open('$config_file'))" 2>/dev/null; then
            log_success "Config file valid: $config_file"
        else
            log_error "Config file has invalid JSON syntax: $config_file"
            return 1
        fi
    else
        log_success "Config file exists: $config_file"
    fi

    return 0
}

check_python_packages() {
    log_info "Checking Python packages..."

    if [ ! -d ".venv" ]; then
        log_warning "Skipping Python package check (venv not created)"
        return 0
    fi

    local python_bin=".venv/bin/python"
    if [ "$(uname -s)" = "MINGW"* ] || [ "$(uname -s)" = "MSYS"* ]; then
        python_bin=".venv/Scripts/python.exe"
    fi

    if [ ! -f "$python_bin" ]; then
        log_warning "Python binary not found in venv"
        return 0
    fi

    local required_packages=("fastapi" "uvicorn" "litellm")
    local missing=()

    for package in "${required_packages[@]}"; do
        if ! "$python_bin" -c "import $package" 2>/dev/null; then
            missing+=("$package")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_warning "Missing Python packages: ${missing[*]}"
        log_warning "  Run: make setup-python"
        return 0
    fi

    log_success "Required Python packages installed"
    return 0
}

check_port_available() {
    local preferred_port=${HERMES_API_PORT:-8765}

    log_info "Checking if preferred backend port ${preferred_port} is available..."

    if command -v lsof >/dev/null 2>&1; then
        if lsof -i:"${preferred_port}" -P -n | grep LISTEN >/dev/null 2>&1; then
            log_warning "Port ${preferred_port} is already in use"
            log_warning "  Hermes will try the next free backend port at startup."
            log_warning "  Check: lsof -i:${preferred_port} -P -n"
            return 0
        fi
        log_success "Port ${preferred_port} available"
    elif command -v netstat >/dev/null 2>&1; then
        if netstat -an | grep "${preferred_port}.*LISTEN" >/dev/null 2>&1; then
            log_warning "Port ${preferred_port} may be in use"
            log_warning "  Hermes will try the next free backend port at startup."
            return 0
        fi
        log_success "Port ${preferred_port} appears available"
    else
        log_info "Cannot check port availability (lsof/netstat not found)"
    fi

    return 0
}

print_summary() {
    echo
    echo "========================================="
    if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        printf "${GREEN}All checks passed!${NC}\n"
        echo "Run 'make start' to launch Hermes"
    elif [ $ERRORS -eq 0 ]; then
        printf "${YELLOW}%d warning(s) found${NC}\n" "$WARNINGS"
        echo "Run 'make setup' to complete installation"
    else
        printf "${RED}%d error(s) found${NC}\n" "$ERRORS"
        echo "Fix the errors above and run this script again"
    fi
    echo "========================================="
}

main() {
    log_info "Starting Hermes dependency check..."
    echo

    check_python_version
    check_node_version
    check_command npm "npm" "https://nodejs.org/ or brew install node"
    check_rust
    check_macos_dependencies
    echo
    check_virtual_env
    check_npm_deps
    check_config_file
    check_python_packages
    check_port_available

    print_summary

    if [ $ERRORS -gt 0 ]; then
        exit 1
    fi

    exit 0
}

main "$@"
