"""Round-trip Markdown (as edited by an officer) back into the block model, so a
human-edited version exports with the same structure as the AI draft."""

from __future__ import annotations

import re

_KV = re.compile(r"^\s*-\s+\*\*(?P<label>[^*]+?):\*\*\s*(?P<value>.*)$")
_HEADING = re.compile(r"^(#{1,4})\s+(.*)$")
_TABLE_SEP = re.compile(r"^\s*\|[\s:|-]+\|\s*$")


def _split_row(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def md_to_blocks(md: str) -> list[dict]:
    lines = md.splitlines()
    blocks: list[dict] = []
    para: list[str] = []
    kv: list[dict] = []
    i = 0

    def flush_para() -> None:
        nonlocal para
        if para:
            blocks.append({"type": "paragraph", "text": "\n".join(para).strip(), "editable": True})
            para = []

    def flush_kv() -> None:
        nonlocal kv
        if kv:
            blocks.append({"type": "kv", "items": kv, "editable": True})
            kv = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        h = _HEADING.match(line)
        if h:
            flush_para()
            flush_kv()
            blocks.append({"type": "heading", "level": len(h.group(1)),
                           "text": h.group(2).strip(), "editable": True})
            i += 1
            continue

        m = _KV.match(line)
        if m:
            flush_para()
            kv.append({"label": m.group("label").strip(), "value": m.group("value").strip()})
            i += 1
            continue

        if stripped.startswith("|") and i + 1 < len(lines) and _TABLE_SEP.match(lines[i + 1]):
            flush_para()
            flush_kv()
            columns = _split_row(line)
            rows: list[list[str]] = []
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(_split_row(lines[i]))
                i += 1
            blocks.append({"type": "table", "columns": columns, "rows": rows, "editable": True})
            continue

        if stripped == "---":
            flush_para()
            flush_kv()
            i += 1
            continue

        if stripped:
            flush_kv()
            para.append(stripped)
        else:
            flush_para()
            flush_kv()
        i += 1

    flush_para()
    flush_kv()
    # drop a trailing "Sources" section — it is regenerated from citations on render
    out: list[dict] = []
    skip = False
    for b in blocks:
        if b["type"] == "heading" and b["text"].strip().lower() == "sources":
            skip = True
            continue
        if not skip:
            out.append(b)
    return out
