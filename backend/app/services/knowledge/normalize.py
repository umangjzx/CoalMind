"""Canonicalisation helpers for entity de-duplication."""

from __future__ import annotations

import re

_WS = re.compile(r"\s+")
_NOISE = re.compile(r"\b(the|a|an|ltd|limited|project|colliery|mine|opencast|oc|underground)\b")
_PUNCT = re.compile(r"[^\w\s-]")


def norm_key(value: str) -> str:
    """Lowercase, strip punctuation and common filler words, collapse whitespace.

    "Jhanjra Underground Project" and "jhanjra project" both -> "jhanjra".
    """
    s = _PUNCT.sub(" ", value.lower())
    s = _NOISE.sub(" ", s)
    s = _WS.sub(" ", s).strip()
    return s or value.lower().strip()


def clean_name(value: str) -> str:
    return _WS.sub(" ", value).strip(" .:-–")
