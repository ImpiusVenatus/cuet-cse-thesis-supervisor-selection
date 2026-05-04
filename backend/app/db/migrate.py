"""Apply Alembic migrations on process startup (Neon, SQLite, or any configured URL)."""

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.core.config import BACKEND_ROOT

logger = logging.getLogger(__name__)


def run_migrations_to_head() -> None:
    """Idempotent: `upgrade head` is a no-op when the DB is already at head."""
    ini_path = BACKEND_ROOT / "alembic.ini"
    if not ini_path.is_file():
        logger.warning("alembic.ini not found at %s — skipping migrations", ini_path)
        return

    cfg = Config(str(ini_path))
    # Resolve script_location relative to backend/ (same directory as alembic.ini)
    script_loc = cfg.get_main_option("script_location")
    if script_loc and not Path(script_loc).is_absolute():
        cfg.set_main_option("script_location", str((ini_path.parent / script_loc).resolve()))

    logger.info("Checking database migrations (upgrade head)…")
    command.upgrade(cfg, "head")
    logger.info("Database schema is up to date.")
