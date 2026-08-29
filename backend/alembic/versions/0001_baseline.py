"""baseline schema: subsidiary, app_user, document, extraction_field, audit_event

Revision ID: 0001_baseline
Revises:
Create Date: 2026-08-29
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: we create/drop these explicitly below, so create_table()
# must not try to emit CREATE TYPE a second time.
user_role = postgresql.ENUM(
    "reporting_officer", "geologist", "ministry_official", "data_admin", "records_clerk",
    name="user_role", create_type=False,
)
document_status = postgresql.ENUM(
    "received", "processing", "extracted", "needs_review", "ready", "failed",
    name="document_status", create_type=False,
)
field_status = postgresql.ENUM(
    "auto_accepted", "needs_review", "verified", "rejected",
    name="field_status", create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    user_role.create(bind, checkfirst=True)
    document_status.create(bind, checkfirst=True)
    field_status.create(bind, checkfirst=True)

    ts = dict(server_default=sa.text("now()"), nullable=False)

    op.create_table(
        "subsidiary",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column("code", sa.String(8), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("is_national", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("code", name="uq_subsidiary_code"),
    )
    op.create_index("ix_subsidiary_code", "subsidiary", ["code"])

    op.create_table(
        "app_user",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "subsidiary_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subsidiary.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("email", name="uq_user_email"),
    )
    op.create_index("ix_app_user_email", "app_user", ["email"])

    op.create_table(
        "document",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column("original_filename", sa.String(512), nullable=False),
        sa.Column("content_type", sa.String(128), nullable=False,
                  server_default="application/octet-stream"),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(1024), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("doc_type", sa.String(64), nullable=True),
        sa.Column("language", sa.String(16), nullable=True),
        sa.Column("doc_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", document_status, nullable=False, server_default="received"),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column(
            "subsidiary_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("subsidiary.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "uploaded_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("sha256", name="uq_document_sha256"),
    )
    op.create_index("ix_document_sha256", "document", ["sha256"])
    op.create_index("ix_document_status", "document", ["status"])

    op.create_table(
        "extraction_field",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **ts),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("field_key", sa.String(128), nullable=False),
        sa.Column("value_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("value_json", postgresql.JSONB(), nullable=True),
        sa.Column("entity_type", sa.String(64), nullable=True),
        sa.Column("page_no", sa.Integer(), nullable=True),
        sa.Column("bbox", postgresql.JSONB(), nullable=True),
        sa.Column("source_snippet", sa.Text(), nullable=False, server_default=""),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", field_status, nullable=False, server_default="needs_review"),
        sa.Column(
            "reviewed_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("app_user.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_extraction_field_document_id", "extraction_field", ["document_id"])
    op.create_index("ix_extraction_field_field_key", "extraction_field", ["field_key"])
    op.create_index("ix_extraction_field_status", "extraction_field", ["status"])

    op.create_table(
        "audit_event",
        sa.Column("seq", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("at", sa.DateTime(timezone=True), **ts),
        sa.Column("actor", sa.String(160), nullable=False, server_default="system"),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("target_type", sa.String(64), nullable=True),
        sa.Column("target_id", sa.String(64), nullable=True),
        sa.Column("meta", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("prev_hash", sa.String(64), nullable=True),
        sa.Column("entry_hash", sa.String(64), nullable=True),
        sa.UniqueConstraint("id", name="uq_audit_event_id"),
    )
    op.create_index("ix_audit_event_at", "audit_event", ["at"])
    op.create_index("ix_audit_event_action", "audit_event", ["action"])


def downgrade() -> None:
    op.drop_table("audit_event")
    op.drop_table("extraction_field")
    op.drop_table("document")
    op.drop_table("app_user")
    op.drop_table("subsidiary")
    bind = op.get_bind()
    field_status.drop(bind, checkfirst=True)
    document_status.drop(bind, checkfirst=True)
    user_role.drop(bind, checkfirst=True)
