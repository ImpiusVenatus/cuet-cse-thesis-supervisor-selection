"""Session and phase control API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import SessionConfig, Student
from app.schemas.schemas import (
    SessionSetup, SessionConfigResponse, SessionStatus, EventType
)
from app.engine import allocation_engine

router = APIRouter(prefix="/api/session", tags=["session"])


@router.get("/", response_model=SessionConfigResponse)
def get_session(db: Session = Depends(get_db)):
    """Get current session config/status."""
    config = allocation_engine.get_session_config(db)
    return config


@router.post("/setup", response_model=SessionConfigResponse)
def setup_session(data: SessionSetup, db: Session = Depends(get_db)):
    """Initialize session."""
    config = allocation_engine.get_session_config(db)

    config.total_students = data.total_students
    config.choice_threshold = data.choice_threshold
    config.session_status = SessionStatus.SETUP.value
    config.current_choice_rank = 1
    config.forfeit_count = 0
    config.updated_at = allocation_engine.datetime.utcnow()

    # Update student privileges based on threshold
    students = db.query(Student).order_by(Student.merit_rank).all()
    for student in students:
        student.has_choice_privilege = student.merit_rank <= data.choice_threshold

    allocation_engine.log_event(
        db, EventType.SESSION_SETUP,
        metadata={
            "total_students": data.total_students,
            "choice_threshold": data.choice_threshold,
        }
    )

    db.commit()
    db.refresh(config)
    return config


@router.post("/start-choice", response_model=SessionConfigResponse)
def start_choice_phase(db: Session = Depends(get_db)):
    """Transition to choice phase."""
    config = allocation_engine.get_session_config(db)

    if config.session_status != SessionStatus.SETUP.value:
        raise HTTPException(
            status_code=400,
            detail=f"Can only start choice phase from setup phase (current: {config.session_status})"
        )

    old_status = config.session_status
    config.session_status = SessionStatus.CHOICE_PHASE.value
    config.current_choice_rank = 1
    config.updated_at = allocation_engine.datetime.utcnow()

    allocation_engine.log_event(
        db, EventType.PHASE_CHANGE,
        metadata={"from": old_status, "to": SessionStatus.CHOICE_PHASE.value}
    )

    db.commit()
    db.refresh(config)
    return config


@router.post("/start-lottery", response_model=SessionConfigResponse)
def start_lottery_phase(db: Session = Depends(get_db)):
    """Transition to lottery phase."""
    config = allocation_engine.get_session_config(db)

    if config.session_status != SessionStatus.CHOICE_PHASE.value:
        raise HTTPException(
            status_code=400,
            detail=f"Can only start lottery phase from choice phase (current: {config.session_status})"
        )

    old_status = config.session_status
    config.session_status = SessionStatus.LOTTERY_PHASE.value
    config.updated_at = allocation_engine.datetime.utcnow()

    allocation_engine.log_event(
        db, EventType.PHASE_CHANGE,
        metadata={"from": old_status, "to": SessionStatus.LOTTERY_PHASE.value}
    )

    db.commit()
    db.refresh(config)
    return config


@router.post("/complete", response_model=SessionConfigResponse)
def complete_session(db: Session = Depends(get_db)):
    """Mark session as completed."""
    config = allocation_engine.get_session_config(db)

    old_status = config.session_status
    config.session_status = SessionStatus.COMPLETED.value
    config.updated_at = allocation_engine.datetime.utcnow()

    allocation_engine.log_event(
        db, EventType.PHASE_CHANGE,
        metadata={"from": old_status, "to": SessionStatus.COMPLETED.value}
    )

    db.commit()
    db.refresh(config)
    return config


@router.post("/reset")
def reset_session(password: str, db: Session = Depends(get_db)):
    """Hard reset (password-protected)."""
    # Default reset password - should be configurable
    RESET_PASSWORD = "reset2026"

    if password != RESET_PASSWORD:
        raise HTTPException(status_code=403, detail="Incorrect reset password")

    # Clear all student assignments
    db.query(Student).update({
        Student.supervisor_id: None,
        Student.assignment_type: None,
        Student.assignment_time: None,
        Student.has_forfeited: False,
        Student.forfeit_order: None,
        Student.has_choice_privilege: False,
    })

    # Reset supervisor counters
    from app.models.models import Supervisor
    db.query(Supervisor).update({
        Supervisor.choice_filled: 0,
        Supervisor.lottery_filled: 0,
        Supervisor.is_available: True,
    })

    # Reset session config
    config = allocation_engine.get_session_config(db)
    config.session_status = SessionStatus.SETUP.value
    config.current_choice_rank = 1
    config.forfeit_count = 0
    config.updated_at = allocation_engine.datetime.utcnow()

    allocation_engine.log_event(
        db, EventType.SESSION_RESET,
        metadata={"reset_by": "coordinator"}
    )

    db.commit()

    return {"message": "Session has been reset successfully"}
