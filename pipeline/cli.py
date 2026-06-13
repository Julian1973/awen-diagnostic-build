"""Command-line entry point.

Examples
--------
Run from a config file::

    python -m pipeline run --config config/pipeline.example.json

Run from a one-off topic with no config file::

    python -m pipeline run --topic "black holes" --provider mock
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import RunConfig
from .orchestrator import run as run_pipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pipeline", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    run_cmd = sub.add_parser("run", help="Run the script->package pipeline")
    run_cmd.add_argument("--config", type=Path, help="Path to a JSON/YAML run config")
    run_cmd.add_argument("--topic", help="Topic (overrides config, or use without a config)")
    run_cmd.add_argument("--provider", help="Provider name (default: mock)")
    run_cmd.add_argument("--output-dir", help="Where to write run packages")
    run_cmd.add_argument(
        "--force", action="store_true", help="Re-run every stage, ignoring saved state"
    )

    args = parser.parse_args(argv)

    if args.command == "run":
        return _cmd_run(args)
    parser.error(f"unknown command: {args.command}")
    return 2


def _cmd_run(args: argparse.Namespace) -> int:
    if args.config:
        config = RunConfig.load(args.config)
    elif args.topic:
        config = RunConfig(topic=args.topic)
    else:
        print("error: provide --config or --topic", file=sys.stderr)
        return 2

    # CLI flags override config values.
    if args.topic:
        config.topic = args.topic
    if args.provider:
        config.provider = args.provider
    if args.output_dir:
        config.output_dir = args.output_dir

    run_pipeline(config, force=args.force, report=lambda m: print(m))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
