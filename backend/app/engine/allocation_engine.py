"""
Core allocation engine for thesis supervisor assignment.

Handles:
- Choice phase: student selects supervisor, validation, counters
- Forfeit handling: student joins lottery queue with priority
- Lottery phase: auto-assignment based on merit + forfeit order
- Undo: revert an assignment
"""

from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List, Tuple

from app.models.models import (
    Supervisor, Student, SessionConfig, EventLog
)
from app.schemas.schemas import EventType, SessionStatus, AssignmentType


class AllocationError(Exception):
    """Base exception for allocation errors."""
    pass


class PhaseError(AllocationError):
    """Raised when action is invalid for current phase."""
    pass


class CapacityError(AllocationError):
    """Raised when supervisor capacity is exceeded."""
    pass


class PrivilegeError(AllocationError):
    """Raised when student lacks choice privilege."""
    pass


def get_session_config(db: Session) -> SessionConfig:
    """Get the singleton session config."""
    config = db.query(SessionConfig).filter(SessionConfig.id == 1).first()
    if not config:
        config = SessionConfig(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def log_event(
    db: Session,
    event_type: EventType,
    student_id: Optional[int] = None,
    supervisor_id: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> EventLog:
    """Log an event to the event log."""
    event = EventLog(
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
    """Validate that current phase allows the requested action."""
    if SessionStatus(session_config.session_status) not in allowed_phases:
        raise PhaseError(
            f"Action not allowed in phase '{session_config.session_status}'. "
            f"Allowed: {[p.value for p in allowed_phases]}"
        )


def make_choice(
    db: Session,
    student_id: int,
    supervisor_id: int,
) -> Tuple[Student, Supervisor]:
    """
    Process a student's choice of supervisor.

    Rules:
    - Must be in choice_phase
    - Student must have choice privilege
    - Student must not have forfeited
    - Supervisor must have available choice_capacity
    - Student must be the current one in merit order
    """
    session_config = get_session_config(db)
    validate_phase_for_action(session_config, [SessionStatus.CHOICE_PHASE])

    # Get student
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise AllocationError(f"Student {student_id} not found")

    if not student.has_choice_privilege:
        raise PrivilegeError(f"Student {student.name} does not have choice privilege")

    if student.has_forfeited:
        raise AllocationError(f"Student {student.name} has forfeited and cannot make a choice")

    if student.supervisor_id is not None:
        raise AllocationError(f"Student {student.name} is already assigned")

    # Verify this is the current student in order
    if student.merit_rank != session_config.current_choice_rank:
        raise AllocationError(
            f"Student {student.name} (rank {student.merit_rank}) is not next in order. "
            f"Expected rank {session_config.current_choice_rank}"
        )

    # Get supervisor
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise AllocationError(f"Supervisor {supervisor_id} not found")

    if not supervisor.is_available:
        raise AllocationError(f"Supervisor {supervisor.name} is not available")

    if supervisor.choice_filled >= supervisor.choice_capacity:
        raise CapacityError(
            f"Supervisor {supervisor.name} has filled all choice slots "
            f"({supervisor.choice_filled}/{supervisor.choice_capacity})"
        )

    if supervisor.choice_filled + supervisor.lottery_filled >= supervisor.total_capacity:
        raise CapacityError(
            f"Supervisor {supervisor.name} has reached total capacity "
            f"({supervisor.total_capacity})"
        )

    # Make the assignment
    student.supervisor_id = supervisor_id
    student.assignment_type = AssignmentType.CHOICE.value
    student.assignment_time = datetime.utcnow()

    supervisor.choice_filled += 1

    # Advance to next student
    session_config.current_choice_rank += 1
    session_config.updated_at = datetime.utcnow()

    # Log event
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

    return student, supervisor


def forfeit_choice(
    db: Session,
    student_id: int,
) -> Student:
    """
    Process a student forfeiting their choice privilege.

    Rules:
    - Must be in choice_phase
    - Student must have choice privilege
    - Student joins lottery queue with forfeit_order
    """
    session_config = get_session_config(db)
    validate_phase_for_action(session_config, [SessionStatus.CHOICE_PHASE])

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise AllocationError(f"Student {student_id} not found")

    if not student.has_choice_privilege:
        raise PrivilegeError(f"Student {student.name} does not have choice privilege")

    if student.has_forfeited:
        raise AllocationError(f"Student {student.name} has already forfeited")

    # Mark as forfeited
    student.has_forfeited = True
    session_config.forfeit_count += 1
    student.forfeit_order = session_config.forfeit_count

    # Advance to next student
    session_config.current_choice_rank += 1
    session_config.updated_at = datetime.utcnow()

    # Log event
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
    """
    Coordinator skips the current student (temporarily).

    The student remains in the queue but we move to the next rank.
    """
    session_config = get_session_config(db)
    validate_phase_for_action(session_config, [SessionStatus.CHOICE_PHASE])

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise AllocationError(f"Student {student_id} not found")

    # Just advance the rank
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


def build_lottery_queue(db: Session) -> List[Student]:
    """
    Build the lottery queue.

    Order:
    1. Forfeited students (ordered by forfeit_order ascending)
    2. Remaining unassigned students with choice privilege (ordered by merit_rank)
    3. Remaining unassigned students without choice privilege (ordered by merit_rank)
    """
    # Get all unassigned students
    unassigned = db.query(Student).filter(Student.supervisor_id.is_(None)).all()

    forfeited = [s for s in unassigned if s.has_forfeited]
    forfeited.sort(key=lambda s: s.forfeit_order or float('inf'))

    privileged = [s for s in unassigned if s.has_choice_privilege and not s.has_forfeited]
    privileged.sort(key=lambda s: s.merit_rank)

    non_privileged = [s for s in unassigned if not s.has_choice_privilege]
    non_privileged.sort(key=lambda s: s.merit_rank)

    return forfeited + privileged + non_privileged


def run_lottery_auto(db: Session) -> List[Tuple[Student, Supervisor]]:
    """
    Run the full lottery automatically assigning all remaining students.

    Students are assigned in queue order to supervisors with available lottery slots.
    """
    session_config = get_session_config(db)
    validate_phase_for_action(session_config, [SessionStatus.LOTTERY_PHASE])

    queue = build_lottery_queue(db)
    supervisors = db.query(Supervisor).filter(Supervisor.is_available == True).all()

    assignments = []

    for student in queue:
        assigned = False
        for supervisor in supervisors:
            # Check lottery capacity
            if supervisor.lottery_filled >= supervisor.lottery_capacity:
                continue
            # Check total capacity
            if supervisor.choice_filled + supervisor.lottery_filled >= supervisor.total_capacity:
                continue

            # Assign
            student.supervisor_id = supervisor.id
            student.assignment_type = AssignmentType.LOTTERY.value
            student.assignment_time = datetime.utcnow()

            supervisor.lottery_filled += 1

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
            # Student could not be assigned - flag as overflow
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

    session_config.session_status = SessionStatus.COMPLETED.value
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
    """
    Undo a student's assignment.

    - Reopens the supervisor's slot
    - Re-queues the student (removes assignment)
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise AllocationError(f"Student {student_id} not found")

    if student.supervisor_id is None:
        raise AllocationError(f"Student {student.name} is not assigned")

    supervisor = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
    if supervisor:
        if student.assignment_type == AssignmentType.CHOICE.value:
            supervisor.choice_filled = max(0, supervisor.choice_filled - 1)
        elif student.assignment_type == AssignmentType.LOTTERY.value:
            supervisor.lottery_filled = max(0, supervisor.lottery_filled - 1)

    student.supervisor_id = None
    student.assignment_type = None
    student.assignment_time = None

    # If in choice phase, reset current_choice_rank if needed
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
    """Get the current state of the allocation queue."""
    session_config = get_session_config(db)

    current_student = None
    queue = []
    forfeited_students = []

    if session_config.session_status == SessionStatus.CHOICE_PHASE.value:
        # Get current student by merit rank
        current_student = db.query(Student).filter(
            Student.merit_rank == session_config.current_choice_rank
        ).first()

        # Get remaining students with choice privilege who haven't been processed
        queue = db.query(Student).filter(
            Student.has_choice_privilege == True,
            Student.supervisor_id.is_(None),
            Student.has_forfeited == False,
            Student.merit_rank >= session_config.current_choice_rank,
        ).order_by(Student.merit_rank).all()

        # Get forfeited students
        forfeited_students = db.query(Student).filter(
            Student.has_forfeited == True,
            Student.supervisor_id.is_(None),
        ).order_by(Student.forfeit_order).all()

    elif session_config.session_status in [SessionStatus.LOTTERY_PHASE.value, SessionStatus.COMPLETED.value]:
        queue = build_lottery_queue(db)
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
    """Get all assignment results."""
    return db.query(Student).filter(
        Student.supervisor_id.isnot(None)
    ).order_by(Student.merit_rank).all()
