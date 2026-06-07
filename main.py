from __future__ import annotations

import argparse
import importlib
import logging
import sys
from pathlib import Path

from config import AppConfig
from core.logging import (
    create_trace_logger,
    log_startup_diagnostics,
    setup_exception_handler,
    setup_logging,
)
from ui.bridge import WorkbenchBridge


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Hermes MCP AI IDE Workbench backend")
    parser.add_argument("--config", default="hermes.example.json", help="Path to Hermes config JSON")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface for the backend API")
    parser.add_argument("--port", type=int, default=8765, help="Port for the backend API")
    parser.add_argument("--workspace", default=".", help="Workspace root for data storage")
    parser.add_argument("--log-level", default="INFO", help="Logging level (DEBUG, INFO, WARNING, ERROR)")
    parser.add_argument("--log-dir", help="Directory for log files (default: .hermes/logs)")
    return parser


def validate_config(config_path: str, logger: logging.LoggerAdapter) -> bool:
    """Validate configuration file exists and is readable."""
    config_file = Path(config_path)

    if not config_file.exists():
        logger.error(f"Configuration file not found: {config_path}")
        logger.error("Create it from the template: cp hermes.example.json hermes.local.json")
        return False

    try:
        AppConfig.load(config_path)
        logger.info(f"Configuration loaded successfully: {config_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to load configuration: {e}", exc_info=True)
        return False


def main() -> None:
    args = build_parser().parse_args()

    # Setup logging
    log_dir = Path(args.log_dir) if args.log_dir else None
    setup_logging(log_dir=log_dir, log_level=args.log_level)
    setup_exception_handler()

    # Create trace logger for this run
    logger = create_trace_logger("hermes.main")

    # Log startup diagnostics
    diagnostics = log_startup_diagnostics(log_dir)
    logger.info(f"Hermes starting (startup_id: {diagnostics['startup_id']})")

    # Validate configuration
    if not validate_config(args.config, logger):
        sys.exit(1)

    try:
        config = AppConfig.load(args.config)
        workspace_root = Path(args.workspace).resolve()

        # Ensure workspace directory exists
        workspace_root.mkdir(parents=True, exist_ok=True)
        logger.info(f"Workspace root: {workspace_root}")

        bridge = WorkbenchBridge(
            config=config,
            config_path=Path(args.config).resolve(),
            workspace_root=workspace_root,
        )

        logger.info(f"Starting server on {args.host}:{args.port}")

        uvicorn = importlib.import_module("uvicorn")
        uvicorn.run(
            bridge.app,
            host=args.host,
            port=args.port,
            log_level=args.log_level.lower(),
        )

    except KeyboardInterrupt:
        logger.info("Shutdown requested by user")
        sys.exit(0)
    except Exception as e:
        logger.critical("Fatal error during startup", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()