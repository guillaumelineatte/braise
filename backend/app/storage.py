"""Stockage des images : disque en local, S3 (ou compatible) en prod."""

import asyncio
from pathlib import Path
from typing import Protocol

from .config import Settings


class Storage(Protocol):
    async def save(self, path: str, data: bytes, content_type: str) -> None: ...

    async def delete(self, path: str) -> None: ...

    def url(self, path: str) -> str: ...


class LocalStorage:
    """Fichiers dans MEDIA_ROOT, servis par l'API sous MEDIA_URL."""

    def __init__(self, root: Path, base_url: str) -> None:
        self.root = root.resolve()
        self.base_url = base_url.rstrip("/")

    def _path(self, path: str) -> Path:
        target = (self.root / path).resolve()
        if self.root not in target.parents:
            raise ValueError(f"Chemin hors du dossier média : {path}")
        return target

    async def save(self, path: str, data: bytes, content_type: str) -> None:
        target = self._path(path)

        def write() -> None:
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_suffix(target.suffix + ".tmp")
            tmp.write_bytes(data)
            tmp.replace(target)

        await asyncio.to_thread(write)

    async def delete(self, path: str) -> None:
        target = self._path(path)

        def remove() -> None:
            target.unlink(missing_ok=True)
            # on supprime aussi les dossiers qui se retrouvent vides
            for parent in target.parents:
                if parent == self.root or not parent.is_dir() or any(parent.iterdir()):
                    break
                parent.rmdir()

        await asyncio.to_thread(remove)

    def url(self, path: str) -> str:
        return f"{self.base_url}/{path}"


class S3Storage:
    """S3 ou équivalent (R2, Scaleway, MinIO). Il faut boto3 : pip install ".[s3]"."""

    def __init__(
        self,
        bucket: str,
        *,
        region: str | None = None,
        endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        public_url: str | None = None,
        prefix: str = "",
    ) -> None:
        import boto3  # optionnel, seulement si on utilise S3

        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.client = boto3.client(
            "s3",
            region_name=region,
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
        )
        if public_url:
            self.public_url = public_url.rstrip("/")
        elif endpoint_url:
            self.public_url = f"{endpoint_url.rstrip('/')}/{bucket}"
        else:
            self.public_url = f"https://{bucket}.s3.{region or 'us-east-1'}.amazonaws.com"

    def _key(self, path: str) -> str:
        return f"{self.prefix}/{path}" if self.prefix else path

    async def save(self, path: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=self._key(path),
            Body=data,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )

    async def delete(self, path: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=self._key(path))

    def url(self, path: str) -> str:
        return f"{self.public_url}/{self._key(path)}"


def make_storage(settings: Settings) -> Storage:
    if settings.storage_backend == "s3":
        if not settings.s3_bucket:
            raise RuntimeError("STORAGE_BACKEND=s3 exige S3_BUCKET.")
        return S3Storage(
            settings.s3_bucket,
            region=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
            public_url=settings.s3_public_url,
            prefix=settings.s3_prefix,
        )
    return LocalStorage(settings.media_root, settings.media_url)
