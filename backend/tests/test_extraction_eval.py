"""Regression gate for the extraction-accuracy harness (scripts/eval_extraction.py).

Runs the corpus through classify + extract_fields with no DB and asserts the
digital bucket stays at/above the PRD floor and nothing regresses into a *silent*
error (wrong value auto-accepted) or silent miss.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_HARNESS = Path(__file__).resolve().parents[2] / "scripts" / "eval_extraction.py"


@pytest.fixture(scope="module")
def report():
    if not _HARNESS.exists():
        pytest.skip("eval_extraction.py not found")
    spec = importlib.util.spec_from_file_location("eval_extraction", _HARNESS)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["eval_extraction"] = mod
    spec.loader.exec_module(mod)
    if not (mod.GROUND_TRUTH.exists() and any(mod.GROUND_TRUTH.glob("*.json"))):
        pytest.skip("sample corpus not generated - run: python scripts/dev.py corpus")
    return mod.run()


def test_classification_and_language_accuracy(report):
    assert report["classification_accuracy"] >= 0.85
    assert report["language_accuracy"] >= 0.85


def test_digital_bucket_meets_prd_floor(report):
    d = report["digital"]
    assert d["precision"] >= 0.90
    assert d["recall"] >= 0.85
    assert d["f1"] >= 0.90


def test_no_silent_errors_or_misses(report):
    o = report["overall"]
    assert o["silent_errors"] == 0, "a wrong value was auto-accepted above the threshold"
    assert o["silent_misses"] == 0, "a ground-truth in-scope field was never extracted"


def test_effective_accuracy_after_review(report):
    # with the review queue catching low-confidence fields, effective accuracy
    # should be near-total on the (clean, digital) sample corpus
    assert report["overall"]["effective_accuracy"] >= 0.95


def test_rules_cover_the_ground_truth(report):
    # the rules engine should target essentially every extractable ground-truth
    # field (annotator meta-notes are already filtered out of the corpus)
    o = report["overall"]
    assert o["coverage"] >= 0.95
    assert o["gt_fields_in_scope"] >= 44
