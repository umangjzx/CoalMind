"""CIL subsidiaries and platform users.

Full RBAC / auth lands in M6; these tables exist now so ingestion, audit and
query rows can carry a real subsidiary / owner FK from day one.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import Timestamps, UUIDPk


class UserRole(enum.StrEnum):
    reporting_officer = "reporting_officer"   # CMPDI — compiles parliamentary answers
    geologist = "geologist"                   # subsidiary surveyor / geologist
    ministry_official = "ministry_official"   # Ministry of Coal — cross-subsidiary view
    data_admin = "data_admin"                 # CIL IT — ingestion, RBAC, audit
    records_clerk = "records_clerk"           # legacy archive digitization


class Subsidiary(UUIDPk, Timestamps, Base):
    __tablename__ = "subsidiary"

    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)  # BCCL, CCL, ...
    name: Mapped[str] = mapped_column(String(160))
    is_national: Mapped[bool] = mapped_column(default=False)  # True = shared national scope

    users: Mapped[list[User]] = relationship(back_populates="subsidiary")


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "app_user"
    __table_args__ = (UniqueConstraint("email", name="uq_user_email"),)

    email: Mapped[str] = mapped_column(String(255), index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"))
    hashed_password: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    subsidiary_id: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("subsidiary.id", ondelete="SET NULL"), nullable=True
    )
    subsidiary: Mapped[Subsidiary | None] = relationship(back_populates="users")
