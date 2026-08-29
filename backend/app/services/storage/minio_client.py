"""MinIO / S3 object store wrapper.

Documents are content-addressed: the object key is derived from the SHA-256 of the
bytes, so re-uploading the same file is a no-op and dedupe is automatic.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import timedelta
from functools import lru_cache

from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass(slots=True)
class StoredObject:
    key: str
    sha256: str
    size: int
    existed: bool


class ObjectStore:
    def __init__(self, client: Minio, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)
            log.info("created bucket %s", self._bucket)

    def health(self) -> bool:
        try:
            return self._client.bucket_exists(self._bucket)
        except (S3Error, OSError) as exc:  # pragma: no cover - network dependent
            log.warning("minio health probe failed: %s", exc)
            return False

    @staticmethod
    def _key_for(digest: str, filename: str) -> str:
        suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
        return f"docs/{digest[:2]}/{digest}.{suffix}"

    def put_document(self, data: bytes, filename: str, content_type: str) -> StoredObject:
        digest = hashlib.sha256(data).hexdigest()
        key = self._key_for(digest, filename)
        try:
            self._client.stat_object(self._bucket, key)
            return StoredObject(key=key, sha256=digest, size=len(data), existed=True)
        except S3Error:
            pass  # not found -> upload below
        self._client.put_object(
            self._bucket, key, io.BytesIO(data), length=len(data), content_type=content_type
        )
        return StoredObject(key=key, sha256=digest, size=len(data), existed=False)

    def get_bytes(self, key: str) -> bytes:
        resp = self._client.get_object(self._bucket, key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()

    def presigned_get(self, key: str, expires: timedelta = timedelta(minutes=15)) -> str:
        return self._client.presigned_get_object(self._bucket, key, expires=expires)


@lru_cache
def get_object_store() -> ObjectStore:
    s = get_settings()
    client = Minio(
        s.minio_endpoint,
        access_key=s.minio_root_user,
        secret_key=s.minio_root_password,
        secure=s.minio_secure,
    )
    store = ObjectStore(client, s.minio_bucket)
    return store
