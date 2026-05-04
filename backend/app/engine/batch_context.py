"""Resolve current working batch from system_settings (singleton row id=1)."""

from sqlalchemy.orm import Session

from app.engine.errors import AllocationError
from app.models.models import SystemSettings


def allocation_current_batch_id(db: Session) -> int:
    row = db.query(SystemSettings).filter(SystemSettings.id == 1).first()
    if not row or row.current_batch_id is None:
        raise AllocationError("No working batch is selected.")
    return row.current_batch_id


def get_or_create_usage(db: Session, batch_id: int, supervisor_id: int):
    from app.models.models import SupervisorUsage

    u = (
        db.query(SupervisorUsage)
        .filter(
            SupervisorUsage.batch_id == batch_id,
            SupervisorUsage.supervisor_id == supervisor_id,
        )
        .first()
    )
    if not u:
        u = SupervisorUsage(
            batch_id=batch_id,
            supervisor_id=supervisor_id,
            choice_filled=0,
            lottery_filled=0,
        )
        db.add(u)
        db.flush()
    return u


def recompute_choice_privileges_for_batch(db: Session, batch_id: int) -> None:
    """Set has_choice_privilege from session.choice_threshold for students in batch."""
    from app.models.models import SessionConfig, Student

    cfg = db.query(SessionConfig).filter(SessionConfig.batch_id == batch_id).first()
    if not cfg:
        return
    t = cfg.choice_threshold
    for s in db.query(Student).filter(Student.batch_id == batch_id).all():
        s.has_choice_privilege = s.merit_rank <= t
