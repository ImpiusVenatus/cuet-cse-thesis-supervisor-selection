"""Session and phase control (per working batch)."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.deps_batches import get_stored_current_batch_id
from app.engine import allocation_engine
from app.engine.allocation_engine import get_session_config_for_batch
from app.engine.batch_context import recompute_choice_privileges_for_batch
from app.models.models import Student, Supervisor, SupervisorUsage
from app.schemas.schemas import (
    SessionSetup, SessionConfigResponse, SessionStatus, EventType
)

router = APIRouter(prefix="/api/session", tags=["session"])


@router.get("/", response_model=SessionConfigResponse)
def get_session(batch_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Session for a cohort; omit batch_id for the working batch."""
    if batch_id is not None:
        return get_session_config_for_batch(db, batch_id)
    bid = get_stored_current_batch_id(db)
    if bid is None:
        raise HTTPException(
            status_code=400,
            detail="No working batch selected.",
        )
    return get_session_config_for_batch(db, bid)


@router.post("/setup", response_model=SessionConfigResponse)
def setup_session(data: SessionSetup, db: Session = Depends(get_db)):
    config = allocation_engine.get_session_config(db)
    bid = config.batch_id

    config.total_students = data.total_students
    config.choice_threshold = data.choice_threshold
    config.session_status = SessionStatus.SETUP.value
    config.current_choice_rank = 1
    config.forfeit_count = 0
    config.updated_at = datetime.utcnow()

    for student in db.query(Student).filter(Student.batch_id == bid).order_by(Student.merit_rank).all():
        student.has_choice_privilege = student.merit_rank <= data.choice_threshold

    allocation_engine.log_event(
        db, EventType.SESSION_SETUP,
        metadata={
            "total_students": data.total_students,
            "choice_threshold": data.choice_threshold,
            "batch_id": bid,
        }
    )

    db.commit()
    db.refresh(config)
    return config


@router.post("/start-choice", response_model=SessionConfigResponse)
def start_choice_phase(db: Session = Depends(get_db)):
    config = allocation_engine.get_session_config(db)

    if config.session_status != SessionStatus.SETUP.value:
        raise HTTPException(
            status_code=400,
            detail=f"Can only start choice phase from setup phase (current: {config.session_status})"
        )

    old_status = config.session_status
    config.session_status = SessionStatus.CHOICE_PHASE.value
    config.current_choice_rank = 1
    config.updated_at = datetime.utcnow()

    allocation_engine.log_event(
        db, EventType.PHASE_CHANGE,
        metadata={"from": old_status, "to": SessionStatus.CHOICE_PHASE.value}
    )

    db.commit()
    db.refresh(config)
    return config


@router.post("/start-lottery", response_model=SessionConfigResponse)
def start_lottery_phase(db: Session = Depends(get_db)):
    config = allocation_engine.get_session_config(db)

    if config.session_status != SessionStatus.CHOICE_PHASE.value:
        raise HTTPException(
            status_code=400,
            detail=f"Can only start lottery phase from choice phase (current: {config.session_status})"
        )

    old_status = config.session_status
    config.session_status = SessionStatus.LOTTERY_PHASE.value
    config.updated_at = datetime.utcnow()

    allocation_engine.log_event(
        db, EventType.PHASE_CHANGE,
        metadata={"from": old_status, "to": SessionStatus.LOTTERY_PHASE.value}
    )

    db.commit()
    db.refresh(config)
    return config


@router.post("/complete", response_model=SessionConfigResponse)
def complete_session(db: Session = Depends(get_db)):
    config = allocation_engine.get_session_config(db)

    old_status = config.session_status
    config.session_status = SessionStatus.COMPLETED.value
    config.updated_at = datetime.utcnow()

    allocation_engine.log_event(
        db, EventType.PHASE_CHANGE,
        metadata={"from": old_status, "to": SessionStatus.COMPLETED.value}
    )

    db.commit()
    db.refresh(config)
    return config


@router.post("/reset")
def reset_session(password: str, db: Session = Depends(get_db)):
    RESET_PASSWORD = "reset2026"

    if password != RESET_PASSWORD:
        raise HTTPException(status_code=403, detail="Incorrect reset password")

    cfg = allocation_engine.get_session_config(db)
    bid = cfg.batch_id

    db.query(SupervisorUsage).filter(SupervisorUsage.batch_id == bid).delete(synchronize_session=False)

    db.query(Student).filter(Student.batch_id == bid).update(
        {
            Student.supervisor_id: None,
            Student.assignment_type: None,
            Student.assignment_time: None,
            Student.has_forfeited: False,
            Student.forfeit_order: None,
            Student.has_choice_privilege: False,
        },
        synchronize_session=False,
    )

    db.query(Supervisor).update(
        {
            Supervisor.choice_filled: 0,
            Supervisor.lottery_filled: 0,
            Supervisor.is_available: True,
        },
        synchronize_session=False,
    )

    cfg.session_status = SessionStatus.SETUP.value
    cfg.current_choice_rank = 1
    cfg.forfeit_count = 0
    cfg.updated_at = datetime.utcnow()

    allocation_engine.log_event(
        db, EventType.SESSION_RESET,
        metadata={"reset_by": "coordinator", "batch_id": bid}
    )

    db.commit()
    recompute_choice_privileges_for_batch(db, bid)
    db.commit()

    return {"message": "Session has been reset successfully"}
