# -*- coding: utf-8 -*-
"""Teaching-tutor knowledge access.

Phase 1: retrieve from the local course corpus (BM25, course/station filters).
The old FAQ cards are still loaded and merged; curated corpus docs win on id.
"""
from __future__ import annotations

from typing import Any, Optional

from tutor_retrieve import (
    answer_from_corpus,
    compose_answer,
    is_common_question,
    is_right_question,
    is_textbook_question,
    load_index,
    retrieve,
    retrieve_cards,
    should_answer_from_corpus,
)

def redact_secrets(text: str, key: str = "") -> str:
    # Implemented in tutor_retrieve? keep original here if import fails.
    import re

    s = text or ""
    if key:
        s = s.replace(key, "***")
        if len(key) >= 8:
            s = s.replace(key[:8], "***")
            s = s.replace(key[-4:], "****")
    s = re.sub(r"(?i)(bearer\s+)[A-Za-z0-9_\-./+=]+", r"\1***", s)
    s = re.sub(r"(?i)(api[_-]?key[\"']?\s*[:=]\s*[\"']?)[^\"'\s,]+", r"\1***", s)
    return s


def load_cards() -> list[dict[str, Any]]:
    return [d.as_card() for d in load_index().docs]


def detect_intents(question: str) -> list[str]:
    from tutor_retrieve import _intents_for

    return _intents_for(question)


def answer_from_kb(
    question: str,
    snapshot: dict[str, Any],
    target: Optional[dict[str, Any]] = None,
    cards: Optional[list[dict[str, Any]]] = None,
) -> Optional[dict[str, Any]]:
    if cards:
        return compose_answer(question, snapshot, {"cards": cards, "strength": "high"}, target)
    return compose_answer(question, snapshot, None, target)


