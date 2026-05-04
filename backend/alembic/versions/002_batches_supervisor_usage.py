"""batches, system_settings, supervisor_usage, scoped students/session/events

Revision ID: 002
Revises: 001

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    dialect = conn.dialect.name

    op.create_table(
        "batches",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    if dialect == "postgresql":
        conn.execute(text("INSERT INTO batches (name, created_at) VALUES ('Default cohort', NOW())"))
    else:
        conn.execute(text("INSERT INTO batches (name) VALUES ('Default cohort')"))

    bid = conn.execute(text("SELECT id FROM batches ORDER BY id ASC LIMIT 1")).scalar()
    if bid is None:
        raise RuntimeError("migration: could not read batch id")

    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("current_batch_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["current_batch_id"], ["batches.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    conn.execute(
        text("INSERT INTO system_settings (id, current_batch_id) VALUES (1, :bid)"),
        {"bid": bid},
    )

    op.create_table(
        "supervisor_usage",
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("supervisor_id", sa.Integer(), nullable=False),
        sa.Column("choice_filled", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lottery_filled", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["batch_id"], ["batches.id"]),
        sa.ForeignKeyConstraint(["supervisor_id"], ["supervisors.id"]),
        sa.PrimaryKeyConstraint("batch_id", "supervisor_id"),
    )

    op.add_column("students", sa.Column("batch_id", sa.Integer(), nullable=True))
    op.add_column("session_config", sa.Column("batch_id", sa.Integer(), nullable=True))
    op.add_column("event_log", sa.Column("batch_id", sa.Integer(), nullable=True))

    conn.execute(text("UPDATE students SET batch_id = :bid WHERE batch_id IS NULL"), {"bid": bid})
    conn.execute(text("UPDATE session_config SET batch_id = :bid WHERE batch_id IS NULL"), {"bid": bid})
    conn.execute(
        text("""
            UPDATE event_log SET batch_id = (
                SELECT batch_id FROM students WHERE students.id = event_log.student_id
            )
            WHERE student_id IS NOT NULL
        """)
    )
    conn.execute(text("UPDATE event_log SET batch_id = :bid WHERE batch_id IS NULL"), {"bid": bid})

    conn.execute(
        text("""
            INSERT INTO supervisor_usage (batch_id, supervisor_id, choice_filled, lottery_filled)
            SELECT :bid, id, COALESCE(choice_filled, 0), COALESCE(lottery_filled, 0)
            FROM supervisors
        """),
        {"bid": bid},
    )

    for uc in insp.get_unique_constraints("students"):
        name = uc.get("name")
        if name:
            op.drop_constraint(name, "students", type_="unique")

    op.alter_column("students", "batch_id", nullable=False)

    op.create_unique_constraint(
        "uq_students_batch_student_id", "students", ["batch_id", "student_id"]
    )
    op.create_unique_constraint(
        "uq_students_batch_merit_rank", "students", ["batch_id", "merit_rank"]
    )
    op.create_unique_constraint("uq_students_batch_email", "students", ["batch_id", "email"])

    op.create_foreign_key(
        "fk_students_batch_id_batches", "students", "batches", ["batch_id"], ["id"]
    )

    op.alter_column("session_config", "batch_id", nullable=False)
    op.create_unique_constraint("uq_session_config_batch_id", "session_config", ["batch_id"])
    op.create_foreign_key(
        "fk_session_config_batch_id_batches", "session_config", "batches", ["batch_id"], ["id"]
    )

    op.create_foreign_key(
        "fk_event_log_batch_id_batches", "event_log", "batches", ["batch_id"], ["id"]
    )


def downgrade() -> None:
    raise NotImplementedError("Downgrade not supported for batch migration (data loss).")
