#!/usr/bin/env python
"""Seed reference data: the CIL subsidiaries, a national scope, and demo users.

Idempotent — safe to run repeatedly. Run via:  python scripts/dev.py seed
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from sqlalchemy import select

from app.audit import record_event
from app.core.db import SessionLocal
from app.models import Subsidiary, User, UserRole

SUBSIDIARIES = [
    ("CIL", "Coal India Limited (national / shared)", True),
    ("BCCL", "Bharat Coking Coal Limited", False),
    ("CCL", "Central Coalfields Limited", False),
    ("ECL", "Eastern Coalfields Limited", False),
    ("MCL", "Mahanadi Coalfields Limited", False),
    ("NCL", "Northern Coalfields Limited", False),
    ("SECL", "South Eastern Coalfields Limited", False),
    ("WCL", "Western Coalfields Limited", False),
    ("NEC", "North Eastern Coalfields", False),
]

DEMO_USERS = [
    ("officer@cmpdi.co.in", "R. Menon (Reporting Officer)", UserRole.reporting_officer, "CIL"),
    ("geologist@ccl.co.in", "S. Prasad (Geologist)", UserRole.geologist, "CCL"),
    ("ministry@coal.gov.in", "A. Verma (Ministry of Coal)", UserRole.ministry_official, "CIL"),
    ("admin@coalindia.in", "IT Admin", UserRole.data_admin, "CIL"),
    ("clerk@bccl.co.in", "Records Clerk", UserRole.records_clerk, "BCCL"),
]


def main() -> int:
    with SessionLocal() as db:
        by_code: dict[str, Subsidiary] = {}
        for code, name, is_national in SUBSIDIARIES:
            sub = db.execute(
                select(Subsidiary).where(Subsidiary.code == code)
            ).scalar_one_or_none()
            if sub is None:
                sub = Subsidiary(code=code, name=name, is_national=is_national)
                db.add(sub)
                db.flush()
            else:
                sub.name, sub.is_national = name, is_national
            by_code[code] = sub

        for email, full_name, role, sub_code in DEMO_USERS:
            user = db.execute(
                select(User).where(User.email == email)
            ).scalar_one_or_none()
            if user is None:
                user = User(email=email, full_name=full_name, role=role)
                db.add(user)
            user.full_name, user.role = full_name, role
            user.subsidiary_id = by_code[sub_code].id

        record_event(
            db,
            actor="system",
            action="seed.reference_data",
            meta={"subsidiaries": len(SUBSIDIARIES), "users": len(DEMO_USERS)},
        )
        db.commit()

    print(f"seeded {len(SUBSIDIARIES)} subsidiaries and {len(DEMO_USERS)} demo users")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
