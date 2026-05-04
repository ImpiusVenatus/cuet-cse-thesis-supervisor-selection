"""Attach PostgreSQL sequence to session_config.id (fixes INSERT without id).

Revision ID: 003
Revises: 002

Migration 001 created session_config.id as INTEGER PK without SERIAL/IDENTITY,
so new rows inserted by SQLAlchemy received NULL id and failed on Postgres.
SQLite INTEGER PRIMARY KEY already auto-generates rows; skip there.

"""
from alembic import op
from sqlalchemy import text

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return

    op.execute(text("CREATE SEQUENCE IF NOT EXISTS session_config_id_seq"))

    max_id = conn.execute(text("SELECT COALESCE(MAX(id), 0) FROM session_config")).scalar() or 0
    max_id = int(max_id)
    if max_id > 0:
        op.execute(text(f"SELECT setval('session_config_id_seq', {max_id}, true)"))
    else:
        op.execute(text("SELECT setval('session_config_id_seq', 1, false)"))

    op.execute(
        text(
            "ALTER TABLE session_config "
            "ALTER COLUMN id SET DEFAULT nextval('session_config_id_seq'::regclass)"
        )
    )
    op.execute(text("ALTER SEQUENCE session_config_id_seq OWNED BY session_config.id"))


def downgrade() -> None:
    conn = op.get_bind()
    if conn.dialect.name != "postgresql":
        return
    op.execute(text("ALTER TABLE session_config ALTER COLUMN id DROP DEFAULT"))
    op.execute(text("DROP SEQUENCE IF EXISTS session_config_id_seq CASCADE"))
