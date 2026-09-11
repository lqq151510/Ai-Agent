"""Domain enumerations shared by the persistence and application layers."""

from __future__ import annotations

from enum import Enum


class KnowledgeStatus(str, Enum):
    """Workflow status vocabulary of the existing desktop contract.

    The renderer maps ``ready -> done`` and treats anything else as pending,
    so the wire vocabulary must stay ``inbox`` / ``processing`` / ``ready`` /
    ``failed`` / ``archived``.
    """

    INBOX = "inbox"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"
    ARCHIVED = "archived"


class SourceType(str, Enum):
    WEB = "web"
    PDF = "pdf"
    MARKDOWN = "markdown"
    SNIPPET = "snippet"
    DOCX = "docx"
    PPTX = "pptx"
    HTML = "html"
    TXT = "txt"


# Source types a user may submit through the import endpoints.
IMPORTABLE_SOURCE_TYPES = (
    SourceType.WEB,
    SourceType.PDF,
    SourceType.MARKDOWN,
    SourceType.SNIPPET,
    SourceType.DOCX,
    SourceType.PPTX,
    SourceType.HTML,
    SourceType.TXT,
)


class IngestionJobType(str, Enum):
    IMPORT = "import"
    ORGANIZE = "organize"
    REPROCESS = "reprocess"


class IngestionJobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class OrganizeMode(str, Enum):
    MANUAL = "manual"
    AUTO = "auto"


class PrivacyMode(str, Enum):
    LOCAL_FIRST = "local_first"
    CLOUD_FIRST = "cloud_first"


class ProviderType(str, Enum):
    OPENAI = "openai"
    DEEPSEEK = "deepseek"
    LOCAL_COMPATIBLE = "local_compatible"
    CUSTOM = "custom"


class ModelCheckStatus(str, Enum):
    OK = "ok"
    ERROR = "error"


class ReviewRating(str, Enum):
    AGAIN = "again"
    HARD = "hard"
    GOOD = "good"
    EASY = "easy"


class SourceAssetOrigin(str, Enum):
    """Wire vocabulary expected by the desktop renderer."""

    PICKER = "picker"
    WATCHED_FOLDER = "watched_folder"


class OrganizeOutcome(str, Enum):
    """How a knowledge item was organised, recorded on the ingestion job."""

    MODEL = "model"
    LOCAL_HEURISTIC = "local_heuristic"
