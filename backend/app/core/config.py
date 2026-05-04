"""Application settings (Neon Postgres or optional SQLite fallback)."""

from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ — parent of package app/
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def _normalize_database_url(raw: str) -> str:
    url = raw.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    parsed = urlparse(url)
    if parsed.scheme.startswith("postgresql") and parsed.hostname and parsed.hostname.endswith(
        ".neon.tech"
    ):
        qs = parse_qs(parsed.query, keep_blank_values=True)
        if "sslmode" not in qs:
            qs["sslmode"] = ["require"]
            new_query = urlencode(qs, doseq=True)
            parsed = parsed._replace(query=new_query)
            url = urlunparse(parsed)
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str | None = Field(default=None, description="Neon/other Postgres URL; unset = SQLite")
    environment: str = Field(default="development")
    cors_origins_extra: str = Field(
        default="",
        description="Comma-separated extra browser origins allowed by CORS (in addition to local Next defaults)",
    )

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            return _normalize_database_url(self.database_url)
        data_dir = BACKEND_ROOT / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        db_path = data_dir / "thesis.db"
        return f"sqlite:///{db_path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
