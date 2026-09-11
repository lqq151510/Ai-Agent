"""Deterministic text helpers shared by the ingestion and organise services.

These power the no-model local degradation path, so they must stay pure and
predictable: same input, same output, no network, no clock.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass

MAX_TITLE_LENGTH = 120
MAX_SUMMARY_LENGTH = 240
MIN_SUMMARY_PARAGRAPH_LENGTH = 20
MAX_TAGS = 5
MIN_TAG_LENGTH = 2
MAX_TAG_LENGTH = 18

CJK_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
LATIN_WORD_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9+#.\-]{1,}")
CJK_TERM_PATTERN = re.compile(r"[\u4e00-\u9fff]{2,8}")
TAG_SPLIT_PATTERN = re.compile(r"[\s,，、;；|/\\(){}<>\[\]\"'`~!@#$%^&*=+:?。！？…—－_]+")
WHITESPACE_PATTERN = re.compile(r"[ \t\f\v]+")
BLANK_LINE_PATTERN = re.compile(r"\n\s*\n\s*\n+")
HTML_TAG_PATTERN = re.compile(r"<[^>]{1,200}>")
NUMBER_ONLY_PATTERN = re.compile(r"^[\d.\-_]+$")

LATIN_STOPWORDS = {
    "about", "after", "again", "against", "also", "among", "another", "because", "been",
    "before", "being", "between", "both", "cannot", "could", "does", "doing", "during",
    "each", "either", "else", "from", "further", "have", "having", "here", "however",
    "http", "https", "into", "itself", "just", "like", "made", "make", "many", "might",
    "more", "most", "much", "must", "need", "only", "other", "others", "over", "same",
    "should", "since", "some", "such", "than", "that", "their", "them", "then", "there",
    "these", "they", "this", "those", "through", "under", "until", "upon", "very", "were",
    "what", "when", "where", "which", "while", "with", "within", "without", "would", "your",
    "yours", "www", "com", "org", "net",
}

CJK_STOPWORDS = {
    "我们", "你们", "他们", "这个", "那个", "一个", "以及", "可以", "如果", "因为", "所以",
    "但是", "而且", "然后", "就是", "这样", "那样", "什么", "怎么", "为了", "通过", "对于",
    "关于", "已经", "正在", "没有", "还有", "或者", "并且", "同时", "由于", "根据", "其中",
    "本文", "本节", "以上", "以下", "如下", "例如", "等等", "需要", "进行", "实现", "使用",
}


@dataclass(frozen=True)
class OrganizeDraft:
    cleaned_content: str
    summary: str
    tags: list[str]


def normalize_text(text: str) -> str:
    """Collapse markup noise and redundant whitespace without touching wording."""

    if not text:
        return ""
    value = text.replace("\r\n", "\n").replace("\r", "\n")
    if HTML_TAG_PATTERN.search(value):
        value = HTML_TAG_PATTERN.sub(" ", value)
    value = WHITESPACE_PATTERN.sub(" ", value)
    value = BLANK_LINE_PATTERN.sub("\n\n", value)
    lines: list[str] = []
    previous = None
    for raw_line in value.split("\n"):
        line = raw_line.strip()
        if line == previous and line:
            continue
        lines.append(line)
        previous = line
    return "\n".join(lines).strip()


def strip_markdown(text: str) -> str:
    value = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    value = re.sub(r"^\s*[-*+]\s+", "", value, flags=re.MULTILINE)
    value = re.sub(r"`{1,3}", "", value)
    value = re.sub(r"\*{1,2}([^*]+)\*{1,2}", r"\1", value)
    return value.strip()


def count_words(text: str) -> int:
    if not text:
        return 0
    cjk = len(CJK_PATTERN.findall(text))
    latin = len(LATIN_WORD_PATTERN.findall(text))
    return cjk + latin


def detect_language(text: str) -> str:
    if not text:
        return "und"
    cjk = len(CJK_PATTERN.findall(text))
    latin = len(LATIN_WORD_PATTERN.findall(text))
    if cjk == 0 and latin == 0:
        return "und"
    if cjk >= max(8, int((cjk + latin) * 0.15)):
        return "zh"
    if latin > 0:
        return "en"
    return "und"


def derive_title(explicit_title: str | None, text: str, fallback: str) -> str:
    candidate = (explicit_title or "").strip()
    if candidate:
        return candidate[:MAX_TITLE_LENGTH]
    for line in (text or "").split("\n"):
        stripped = strip_markdown(line).strip(" #*-")
        if len(stripped) >= 4:
            return stripped[:MAX_TITLE_LENGTH]
    for line in (text or "").split("\n"):
        stripped = line.strip()
        if stripped:
            return stripped[:MAX_TITLE_LENGTH]
    return (fallback or "未命名资料")[:MAX_TITLE_LENGTH]


def content_hash(payload: str | bytes) -> str:
    data = payload.encode("utf-8") if isinstance(payload, str) else payload
    return hashlib.sha256(data).hexdigest()


def _candidate_tags(text: str, title: str) -> list[str]:
    scored: Counter[str] = Counter()

    for word in LATIN_WORD_PATTERN.findall(text):
        lowered = word.lower()
        if len(lowered) < 4 or lowered in LATIN_STOPWORDS:
            continue
        scored[lowered] += 1

    for term in CJK_TERM_PATTERN.findall(text):
        if len(term) < MIN_TAG_LENGTH or term in CJK_STOPWORDS:
            continue
        scored[term] += 1

    for token in TAG_SPLIT_PATTERN.split(title):
        cleaned = token.strip().strip("#")
        if MIN_TAG_LENGTH <= len(cleaned) <= MAX_TAG_LENGTH and not NUMBER_ONLY_PATTERN.match(cleaned):
            # Fold latin tokens to lower case so "FastAPI" and "fastapi" are one tag.
            key = cleaned.lower() if cleaned.isascii() else cleaned
            # The title only *boosts* terms the body actually talks about; a
            # title-only term would tag the document with its own subject line.
            if key in scored or key.lower() in text.lower():
                scored[key] += 3

    ordered = sorted(scored.items(), key=lambda pair: (-pair[1], pair[0]))
    tags: list[str] = []
    for term, score in ordered:
        if score < 2:
            continue
        if len(term) > MAX_TAG_LENGTH:
            term = term[:MAX_TAG_LENGTH]
        if term not in tags:
            tags.append(term)
        if len(tags) >= MAX_TAGS:
            break
    return tags


def heuristic_organize(title: str, text: str) -> OrganizeDraft:
    """Deterministic local organiser used when no model source is configured."""

    cleaned = normalize_text(text)
    body = strip_markdown(cleaned) or cleaned
    paragraphs = [chunk.strip() for chunk in re.split(r"\n\s*\n", body) if chunk.strip()]

    summary = ""
    for paragraph in paragraphs:
        flattened = WHITESPACE_PATTERN.sub(" ", paragraph).strip()
        if len(flattened) >= MIN_SUMMARY_PARAGRAPH_LENGTH:
            summary = flattened
            break
    if not summary and paragraphs:
        # Nothing looked like a lead paragraph: take the longest one instead of
        # truncating the whole document from the top.
        summary = max(
            (WHITESPACE_PATTERN.sub(" ", paragraph).strip() for paragraph in paragraphs),
            key=len,
        )
    if not summary:
        summary = WHITESPACE_PATTERN.sub(" ", body).strip()[:MAX_SUMMARY_LENGTH]
    if len(summary) > MAX_SUMMARY_LENGTH:
        summary = summary[:MAX_SUMMARY_LENGTH].rstrip() + "…"

    return OrganizeDraft(cleaned_content=cleaned, summary=summary, tags=_candidate_tags(body, title))
