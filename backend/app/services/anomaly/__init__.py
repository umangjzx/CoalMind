"""Anomaly / inconsistency detection over the knowledge graph (M7, FR-14).

    scan_anomalies(db) -> dict   # (re)detect and upsert; returns counts by kind
"""

from app.services.anomaly.detect import scan_anomalies

__all__ = ["scan_anomalies"]
