#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import dataclasses
import pathlib
import subprocess
import sys
from typing import Iterable


@dataclasses.dataclass(slots=True)
class ProbeResult:
    username: str
    ok: bool
    value: str | None = None
    error: str | None = None


def expand_username_specs(specs: Iterable[str]) -> list[str]:
    usernames: list[str] = []
    for raw_spec in specs:
        spec = raw_spec.strip()
        if not spec:
            continue
        if "-" not in spec:
            usernames.append(spec)
            continue

        start, end = spec.split("-", 1)
        prefix_len = _shared_prefix_length(start, end)
        if prefix_len == 0:
            raise ValueError(f"range must share a stable prefix: {spec}")
        left_digits = start[prefix_len:]
        right_digits = end[prefix_len:]
        if not left_digits.isdigit() or not right_digits.isdigit():
            raise ValueError(f"range suffix must be numeric: {spec}")

        left = int(left_digits)
        right = int(right_digits)
        if left > right:
            raise ValueError(f"range start must be <= end: {spec}")

        width = max(len(left_digits), len(right_digits))
        prefix = start[:prefix_len]
        for value in range(left, right + 1):
            usernames.append(f"{prefix}{value:0{width}d}")
    return usernames


def _shared_prefix_length(left: str, right: str) -> int:
    length = 0
    for left_ch, right_ch in zip(left, right):
        if left_ch != right_ch:
            break
        length += 1
    return length


def render_markdown_table(results: Iterable[ProbeResult]) -> str:
    lines = [
        "| username | status | value | error |",
        "| --- | --- | --- | --- |",
    ]
    for result in results:
        lines.append(
            "| {username} | {status} | {value} | {error} |".format(
                username=_escape_markdown_cell(result.username),
                status="ok" if result.ok else "failed",
                value=_escape_markdown_cell(result.value or "-"),
                error=_escape_markdown_cell(result.error or "-"),
            )
        )
    return "\n".join(lines)


def render_csv(results: Iterable[ProbeResult]) -> str:
    rows = [["username", "status", "value", "error"]]
    for result in results:
        rows.append(
            [
                result.username,
                "ok" if result.ok else "failed",
                result.value or "",
                result.error or "",
            ]
        )

    output: list[str] = []
    writer = csv.writer(_ListWriter(output))
    writer.writerows(rows)
    return "".join(output)


class _ListWriter:
    def __init__(self, output: list[str]) -> None:
        self.output = output

    def write(self, chunk: str) -> int:
        self.output.append(chunk)
        return len(chunk)


def _escape_markdown_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ").strip()


def probe_username(
    *,
    host: str,
    port: int,
    username: str,
    password: str,
    url: str,
    timeout: int,
    curl_bin: str,
) -> ProbeResult:
    proxy = f"socks5h://{username}:{password}@{host}:{port}"
    command = [
        curl_bin,
        "-sS",
        "--max-time",
        str(timeout),
        "--proxy",
        proxy,
        url,
    ]
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode == 0:
        value = completed.stdout.strip()
        return ProbeResult(username=username, ok=True, value=value or "(empty)")

    stderr = (completed.stderr or completed.stdout).strip()
    error = stderr or f"curl exit {completed.returncode}"
    return ProbeResult(username=username, ok=False, error=error)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Probe a SOCKS5 username/password IPv6 proxy pool and render a compact report.",
    )
    parser.add_argument("--host", required=True, help="Proxy host, e.g. 185.44.83.111")
    parser.add_argument("--port", required=True, type=int, help="Proxy port, e.g. 6000")
    parser.add_argument("--password", required=True, help="SOCKS5 password")
    parser.add_argument(
        "--user",
        dest="users",
        action="append",
        default=[],
        help="Single username or inclusive range, e.g. f1000000 or f1000000-f1000005. Repeatable.",
    )
    parser.add_argument(
        "--url",
        default="https://api64.ipify.org",
        help="Probe target URL. Defaults to https://api64.ipify.org",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=15,
        help="Per-request timeout in seconds. Defaults to 15.",
    )
    parser.add_argument(
        "--format",
        choices=("markdown", "csv"),
        default="markdown",
        help="Output format. Defaults to markdown.",
    )
    parser.add_argument(
        "--output",
        help="Optional output file path. If omitted, print to stdout.",
    )
    parser.add_argument(
        "--curl-bin",
        default="curl",
        help="Path to curl binary. Defaults to curl from PATH.",
    )
    args = parser.parse_args()
    if not args.users:
        parser.error("at least one --user is required")
    return args


def main() -> int:
    args = parse_args()
    usernames = expand_username_specs(args.users)
    results = [
        probe_username(
            host=args.host,
            port=args.port,
            username=username,
            password=args.password,
            url=args.url,
            timeout=args.timeout,
            curl_bin=args.curl_bin,
        )
        for username in usernames
    ]

    rendered = (
        render_markdown_table(results)
        if args.format == "markdown"
        else render_csv(results)
    )

    if args.output:
        output_path = pathlib.Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered + ("\n" if not rendered.endswith("\n") else ""), encoding="utf-8")
    else:
        sys.stdout.write(rendered)
        if not rendered.endswith("\n"):
            sys.stdout.write("\n")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
