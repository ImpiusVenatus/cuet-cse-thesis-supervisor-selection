"""
Core allocation engine for thesis supervisor assignment (scoped to current batch).
"""

from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List, Tuple

from app.models.models import (
    Supervisor, Student, SessionConfig, EventLog, SupervisorUsage
)
from app.schemas.schemas import EventType, SessionStatus, AssignmentType
from app.engine.errors import AllocationError, PhaseError, CapacityError, PrivilegeError
from app.engine.batch_context import (
    allocation_current_batch_id,
    get_or_create_usage,
    recompute_choice_privileges_for_batch,
)
from app.engine.capacity_rules import (
    combined_used,
    has_room_for_choice,
    has_room_for_lottery,
    uses_shared_single_seat,
)
from app.models.models import Student

__all__ = [
    "AllocationError", "PhaseError", "CapacityError", "PrivilegeError",
    "get_session_config", "make_choice", "forfeit_choice", "skip_student",
    "run_lottery_auto", "undo_assignment", "get_allocation_queue_state",
    "get_assignment_results", "log_event",
    "recompute_choice_privileges_for_batch",
    "Student",
]


def get_session_config_for_batch(db: Session, batch_id: int) -> SessionConfig:
    config = db.query(SessionConfig).filter(SessionConfig.batch_id == batch_id).first()
    if not config:
        config = SessionConfig(batch_id=batch_id)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def get_session_config(db: Session) -> SessionConfig:
    """Session row for the current working batch."""
    bid = allocation_current_batch_id(db)
    return get_session_config_for_batch(db, bid)


def log_event(
    db: Session,
    event_type: EventType,
    student_id: Optional[int] = None,
    supervisor_id: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> EventLog:
    bid = allocation_current_batch_id(db)
    event = EventLog(
        batch_id=bid,
        event_type=event_type.value,
        student_id=student_id,
        supervisor_id=supervisor_id,
        event_metadata=metadata,
        created_at=datetime.utcnow(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def validate_phase_for_action(session_config: SessionConfig, allowed_phases: List[SessionStatus]):
    if SessionStatus(session_config.session_status) not in allowed_phases:
        raise PhaseError(
            f"Action not allowed in phase '{session_config.session_status}'. "
            f"Allowed: {[p.value for p in allowed_phases]}"
        )


def make_choice(
    db: Session,
    student_id: int,
    supervisor_id: int,
) -> Tuple[Student, Supervisor, SupervisorUsage]:
    session_config = get_session_config(db)
    validate_phase_for_action(session_config, [SessionStatus.CHOICE_PHASE])
    bid = allocation_current_batch_id(db)

    student = db.query(Student).filter(Student.id == student_id, Student.batch_id == bid).first()
    if not student:
        raise AllocationError(f"Student {student_id} not found")

    if not student.has_choice_privilege:
        raise PrivilegeError(f"Student {student.name} does not have choice privilege")

    if student.has_forfeited:
        raise AllocationError(f"Student {student.name} has forfeited and cannot make a choice")

    if student.supervisor_id is not None:
        raise AllocationError(f"Student {student.name} is already assigned")

    if student.merit_rank != session_config.current_choice_rank:
        raise AllocationError(
            f"Student {student.name} (rank {student.merit_rank}) is not next in order. "
            f"Expected rank {session_config.current_choice_rank}"
        )

    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise AllocationError(f"Supervisor {supervisor_id} not found")

    if not supervisor.is_available:
        raise AllocationError(f"Supervisor {supervisor.name} is not available")

    usage = get_or_create_usage(db, bid, supervisor_id)

    if not has_room_for_choice(supervisor, usage):
        if uses_shared_single_seat(supervisor):
            raise CapacityError(
                f"Supervisor {supervisor.name} has no open seat "
                f"(choice-filled {usage.choice_filled}, lottery-filled {usage.lottery_filled}; "
                f"single seat fills in either phase)"
            )
        if usage.choice_filled >= supervisor.choice_capacity:
            raise CapacityError(
                f"Supervisor {supervisor.name} has filled all choice slots "
                f"({usage.choice_filled}/{supervisor.choice_capacity})"
            )
        raise CapacityError(
            f"Supervisor {supervisor.name} is at total capacity ({supervisor.total_capacity}) "
            f"({combined_used(usage)} slots used)"
        )

    student.supervisor_id = supervisor_id
    student.assignment_type = AssignmentType.CHOICE.value
    student.assignment_time = datetime.utcnow()

    usage.choice_filled += 1

    session_config.current_choice_rank += 1
    session_config.updated_at = datetime.utcnow()

    log_event(
        db, EventType.CHOICE_MADE,
        student_id=student_id,
        supervisor_id=supervisor_id,
        metadata={
            "student_name": student.name,
            "supervisor_name": supervisor.name,
            "merit_rank": student.merit_rank,
        }
    )

    db.commit()
    db.refresh(student)
    db.refresh(supervisor)
    db.refresh(usage)

    return student, supervisor, usage


def forfeit_choice(
    db: Session,
    student_id: int,
) -> Student:
    session_config = get_session_config(db)
    validate_phase_for_action(session_config, [SessionStatus.CHOICE_PHASE])
    bid = allocation_current_batch_id(db)

    student = db.query(Student).filter(Student.id == student_id, Student.batch_id == bid).first()
    if not student:
        raise AllocationError(f"Student {student_id} not found")

    if not student.has_choice_privilege:
        raise PrivilegeError(f"Student {student.name} does not have choice privilege")

    if student.has_forfeited:
        raise AllocationError(f"Student {student.name} has already forfeited")

    student.has_forfeited = True
    session_config.forfeit_count += 1
    student.forfeit_order = session_config.forfeit_count

    session_config.current_choice_rank += 1
    session_config.updated_at = datetime.utcnow()

    log_event(
        db, EventType.FORFEITED,
        student_id=student_id,
        metadata={
            "student_name": student.name,
            "merit_rank": student.merit_rank,
            "forfeit_order": student.forfeit_order,
        }
    )

    db.commit()
    db.refresh(student)

    return student


def skip_student(
    db: Session,
    student_id: int,
) -> SessionConfig:
    session_config = get_session_config(db)
    validate_phase_for_action(session_config, [SessionStatus.CHOICE_PHASE])
    bid = allocation_current_batch_id(db)

    student = db.query(Student).filter(Student.id == student_id, Student.batch_id == bid).first()
    if not student:
        raise AllocationError(f"Student {student_id} not found")

    session_config.current_choice_rank += 1
    session_config.updated_at = datetime.utcnow()

    log_event(
        db, EventType.STUDENT_SKIPPED,
        student_id=student_id,
        metadata={"student_name": student.name, "merit_rank": student.merit_rank}
    )

    db.commit()
    db.refresh(session_config)

    return session_config


def build_lottery_queue(db: Session, batch_id: int) -> List[Student]:
    unassigned = (
        db.query(Student)
        .filter(Student.batch_id == batch_id, Student.supervisor_id.is_(None))
        .all()
    )

    forfeited = [s for s in unassigned if s.has_forfeited]
    forfeited.sort(key=lambda s: s.forfeit_order or float("inf"))

    privileged = [s for s in unassigned if s.has_choice_privilege and not s.has_forfeited]
    privileged.sort(key=lambda s: s.merit_rank)

    non_privileged = [s for s in unassigned if not s.has_choice_privilege]
    non_privileged.sort(key=lambda s: s.merit_rank)

    return forfeited + privileged + non_privileged


def run_lottery_auto(db: Session) -> List[Tuple[Student, Supervisor]]:
    session_config = get_session_config(db)
    validate_phase_for_action(session_config, [SessionStatus.LOTTERY_PHASE])
    bid = allocation_current_batch_id(db)

    queue = build_lottery_queue(db, bid)
    supervisors = db.query(Supervisor).filter(Supervisor.is_available == True).all()
    supervisors.sort(key=lambda s: s.id)

    assignments = []

    for student in queue:
        assigned = False
        for supervisor in supervisors:
            usage = get_or_create_usage(db, bid, supervisor.id)

            if not has_room_for_lottery(supervisor, usage):
                continue

            student.supervisor_id = supervisor.id
            student.assignment_type = AssignmentType.LOTTERY.value
            student.assignment_time = datetime.utcnow()

            usage.lottery_filled += 1

            log_event(
                db, EventType.LOTTERY_ASSIGNED,
                student_id=student.id,
                supervisor_id=supervisor.id,
                metadata={
                    "student_name": student.name,
                    "supervisor_name": supervisor.name,
                    "merit_rank": student.merit_rank,
                    "was_forfeited": student.has_forfeited,
                }
            )

            assignments.append((student, supervisor))
            assigned = True
            break

        if not assigned:
            log_event(
                db, EventType.LOTTERY_ASSIGNED,
                student_id=student.id,
                supervisor_id=None,
                metadata={
                    "student_name": student.name,
                    "merit_rank": student.merit_rank,
                    "overflow": True,
                }
            )

    # IMPORTANT: do not auto-complete the session here.
    # The coordinator explicitly ends the ceremony via /api/session/complete.
    session_config.updated_at = datetime.utcnow()
    db.commit()

    for s, sup in assignments:
        db.refresh(s)
        db.refresh(sup)

    return assignments


def undo_assignment(
    db: Session,
    student_id: int,
) -> Tuple[Student, Optional[Supervisor]]:
    bid = allocation_current_batch_id(db)
    student = db.query(Student).filter(Student.id == student_id, Student.batch_id == bid).first()
    if not student:
        raise AllocationError(f"Student {student_id} not found")

    if student.supervisor_id is None:
        raise AllocationError(f"Student {student.name} is not assigned")

    supervisor = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
    if supervisor:
        usage = get_or_create_usage(db, bid, supervisor.id)
        if student.assignment_type == AssignmentType.CHOICE.value:
            usage.choice_filled = max(0, usage.choice_filled - 1)
        elif student.assignment_type == AssignmentType.LOTTERY.value:
            usage.lottery_filled = max(0, usage.lottery_filled - 1)

    student.supervisor_id = None
    student.assignment_type = None
    student.assignment_time = None

    session_config = get_session_config(db)
    if session_config.session_status == SessionStatus.CHOICE_PHASE.value:
        if student.merit_rank < session_config.current_choice_rank:
            session_config.current_choice_rank = student.merit_rank

    db.commit()
    db.refresh(student)
    if supervisor:
        db.refresh(supervisor)

    return student, supervisor


def get_allocation_queue_state(db: Session) -> dict:
    session_config = get_session_config(db)
    bid = allocation_current_batch_id(db)

    current_student = None
    queue = []
    forfeited_students = []

    if session_config.session_status == SessionStatus.CHOICE_PHASE.value:
        current_student = (
            db.query(Student)
            .filter(
                Student.batch_id == bid,
                Student.merit_rank == session_config.current_choice_rank,
            )
            .first()
        )

        queue = (
            db.query(Student)
            .filter(
                Student.batch_id == bid,
                Student.has_choice_privilege == True,
                Student.supervisor_id.is_(None),
                Student.has_forfeited == False,
                Student.merit_rank >= session_config.current_choice_rank,
            )
            .order_by(Student.merit_rank)
            .all()
        )

        forfeited_students = (
            db.query(Student)
            .filter(
                Student.batch_id == bid,
                Student.has_forfeited == True,
                Student.supervisor_id.is_(None),
            )
            .order_by(Student.forfeit_order)
            .all()
        )

    elif session_config.session_status == SessionStatus.LOTTERY_PHASE.value:
        # Lottery is now step-based in the UI: one student picks a hidden card.
        # The "current student" is the next student in the lottery queue.
        full_queue = build_lottery_queue(db, bid)
        current_student = full_queue[0] if full_queue else None
        queue = full_queue[1:] if len(full_queue) > 1 else []
        forfeited_students = [s for s in full_queue if s.has_forfeited]

    elif session_config.session_status == SessionStatus.COMPLETED.value:
        # Ceremony has ended explicitly; keep queue visible for review.
        queue = build_lottery_queue(db, bid)
        forfeited_students = [s for s in queue if s.has_forfeited]

    return {
        "phase": session_config.session_status,
        "current_student": current_student,
        "queue": queue,
        "forfeited_students": forfeited_students,
        "current_choice_rank": session_config.current_choice_rank,
        "forfeit_count": session_config.forfeit_count,
    }


def get_assignment_results(db: Session) -> List[Student]:
    bid = allocation_current_batch_id(db)
    return (
        db.query(Student)
        .filter(Student.batch_id == bid, Student.supervisor_id.isnot(None))
        .order_by(Student.merit_rank)
        .all()
    )
