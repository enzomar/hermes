"""Structured logging and diagnostics for Hermes."""
from __future__ import annotations

import json
import logging
import logging.handlers
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


class StructuredFormatter(logging.Formatter):
    """JSON formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        log_data: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Add trace_id if present
        if hasattr(record, "trace_id"):
            log_data["trace_id"] = record.trace_id

        # Add extra fields
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else None,
                "value": str(record.exc_info[1]) if record.exc_info[1] else None,
                "traceback": traceback.format_exception(*record.exc_info),
            }

        return json.dumps(log_data, default=str)


class ConsoleFormatter(logging.Formatter):
    """Human-readable formatter for console output."""

    COLORS = {
        "DEBUG": "\033[36m",  # Cyan
        "INFO": "\033[32m",  # Green
        "WARNING": "\033[33m",  # Yellow
        "ERROR": "\033[31m",  # Red
        "CRITICAL": "\033[35m",  # Magenta
        "RESET": "\033[0m",
    }

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.COLORS["RESET"])
        reset = self.COLORS["RESET"]

        timestamp = datetime.now().strftime("%H:%M:%S")
        level = f"{color}{record.levelname:8s}{reset}"
        logger_name = f"{record.name:20s}"
        message = record.getMessage()

        # Add trace_id if present
        trace_info = ""
        if hasattr(record, "trace_id"):
            trace_info = f" [{record.trace_id[:8]}]"

        formatted = f"{timestamp} {level} {logger_name}{trace_info} {message}"

        # Add exception if present
        if record.exc_info:
            formatted += "\n" + "".join(traceback.format_exception(*record.exc_info))

        return formatted


class TraceAdapter(logging.LoggerAdapter):
    """Logger adapter that adds trace_id to all log records."""

    def process(self, msg: str, kwargs: Any) -> tuple[str, Any]:
        # Add trace_id to the log record
        extra = kwargs.get("extra", {})
        if "trace_id" in self.extra:
            extra["trace_id"] = self.extra["trace_id"]
        kwargs["extra"] = extra
        return msg, kwargs


def setup_logging(
    log_dir: Path | None = None,
    log_level: str = "INFO",
    enable_console: bool = True,
    enable_file: bool = True,
) -> logging.Logger:
    """
    Set up structured logging with file rotation and console output.

    Args:
        log_dir: Directory for log files. If None, uses .hermes/logs
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        enable_console: Enable console output
        enable_file: Enable file output

    Returns:
        Root logger instance
    """
    # Create log directory
    if log_dir is None:
        log_dir = Path.cwd() / ".hermes" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))

    # Remove existing handlers
    root_logger.handlers.clear()

    # Console handler
    if enable_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(ConsoleFormatter())
        root_logger.addHandler(console_handler)

    # File handlers
    if enable_file:
        # Main log file with JSON formatting
        json_log_file = log_dir / "hermes.log"
        json_handler = logging.handlers.RotatingFileHandler(
            json_log_file,
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
            encoding="utf-8",
        )
        json_handler.setLevel(logging.DEBUG)
        json_handler.setFormatter(StructuredFormatter())
        root_logger.addHandler(json_handler)

        # Error log file
        error_log_file = log_dir / "hermes-errors.log"
        error_handler = logging.handlers.RotatingFileHandler(
            error_log_file,
            maxBytes=5 * 1024 * 1024,  # 5MB
            backupCount=3,
            encoding="utf-8",
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(StructuredFormatter())
        root_logger.addHandler(error_handler)

    return root_logger


def create_trace_logger(name: str, trace_id: str | None = None) -> logging.LoggerAdapter:
    """
    Create a logger with automatic trace_id injection.

    Args:
        name: Logger name
        trace_id: Trace ID to use. If None, generates a new UUID

    Returns:
        Logger adapter with trace_id
    """
    if trace_id is None:
        trace_id = str(uuid4())

    logger = logging.getLogger(name)
    return TraceAdapter(logger, {"trace_id": trace_id})


def log_startup_diagnostics(log_dir: Path | None = None) -> dict[str, Any]:
    """
    Log comprehensive startup diagnostics.

    Args:
        log_dir: Directory for diagnostic file

    Returns:
        Dictionary of diagnostic information
    """
    if log_dir is None:
        log_dir = Path.cwd() / ".hermes" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    import platform
    import socket

    diagnostics = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "startup_id": str(uuid4()),
        "system": {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "machine": platform.machine(),
            "processor": platform.processor(),
            "hostname": socket.gethostname(),
        },
        "environment": {
            "cwd": str(Path.cwd()),
            "python_executable": sys.executable,
            "python_path": sys.path[:5],  # First 5 entries
        },
        "versions": {},
        "config": {
            "log_dir": str(log_dir),
        },
    }

    # Try to get package versions
    try:
        import importlib.metadata

        for package in ["fastapi", "uvicorn", "litellm", "pydantic"]:
            try:
                version = importlib.metadata.version(package)
                diagnostics["versions"][package] = version
            except importlib.metadata.PackageNotFoundError:
                diagnostics["versions"][package] = "not installed"
    except ImportError:
        pass

    # Write diagnostics to file
    diagnostics_file = log_dir / f"startup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    with open(diagnostics_file, "w", encoding="utf-8") as f:
        json.dump(diagnostics, f, indent=2)

    # Log to main logger
    logger = logging.getLogger("hermes.startup")
    logger.info(
        "Startup diagnostics",
        extra={"extra_fields": {"startup_id": diagnostics["startup_id"]}},
    )

    return diagnostics


def setup_exception_handler() -> None:
    """Set up global exception handler for unhandled exceptions."""
    logger = logging.getLogger("hermes.exceptions")

    def exception_handler(exc_type: type, exc_value: BaseException, exc_traceback: Any) -> None:
        """Handle uncaught exceptions."""
        if issubclass(exc_type, KeyboardInterrupt):
            # Call the default handler for KeyboardInterrupt
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return

        logger.critical(
            "Uncaught exception",
            exc_info=(exc_type, exc_value, exc_traceback),
        )

    sys.excepthook = exception_handler
