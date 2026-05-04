"""Allocation API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import csv
import io

from fastapi.responses import StreamingResponse

from app.db.database import get_db
from app.models.models import Student, Supervisor
from app.schemas.schemas import (
    ChoiceRequest, ForfeitRequest, SkipRequest, LotteryRunRequest,
    QueueState, StudentResponse, AssignmentResult
)
from app.engine import allocation_engine
from app.engine.allocation_engine import (
    make_choice, forfeit_choice, skip_student,
    run_lottery_auto, undo_assignment,
    get_allocation_queue_state, get_assignment_results,
)
from app.engine.errors import AllocationError, PhaseError, CapacityError, PrivilegeError

router = APIRouter(prefix="/api/allocation", tags=["allocation"])


@router.get("/queue")
def get_queue(db: Session = Depends(get_db)):
    """Get current choice + lottery queue state."""
    state = get_allocation_queue_state(db)

    # Convert students to response format
    def to_response(student):
        resp = StudentResponse.model_validate(student)
        if student.supervisor_id:
            sup = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
            resp.supervisor_name = sup.name if sup else None
        return resp

    return {
        "phase": state["phase"],
        "current_student": to_response(state["current_student"]) if state["current_student"] else None,
        "queue": [to_response(s) for s in state["queue"]],
        "forfeited_students": [to_response(s) for s in state["forfeited_students"]],
        "current_choice_rank": state["current_choice_rank"],
        "forfeit_count": state["forfeit_count"],
    }


@router.post("/choose")
def choose_supervisor(data: ChoiceRequest, db: Session = Depends(get_db)):
    """Student makes active choice."""
    try:
        student, supervisor, usage = make_choice(db, data.student_id, data.supervisor_id)

        resp = StudentResponse.model_validate(student)
        resp.supervisor_name = supervisor.name
        return {
            "message": "Choice successful",
            "student": resp,
            "supervisor": {
                "id": supervisor.id,
                "name": supervisor.name,
                "choice_filled": usage.choice_filled,
                "choice_capacity": supervisor.choice_capacity,
                "lottery_filled": usage.lottery_filled,
                "lottery_capacity": supervisor.lottery_capacity,
            }
        }
    except (AllocationError, PhaseError, CapacityError, PrivilegeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/forfeit")
def forfeit(data: ForfeitRequest, db: Session = Depends(get_db)):
    """Student forfeits choice privilege."""
    try:
        student = forfeit_choice(db, data.student_id)
        resp = StudentResponse.model_validate(student)
        return {
            "message": "Forfeit successful",
            "student": resp,
        }
    except (AllocationError, PhaseError, PrivilegeError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/skip")
def skip(data: SkipRequest, db: Session = Depends(get_db)):
    """Coordinator skips current student."""
    try:
        config = skip_student(db, data.student_id)
        return {
            "message": "Student skipped",
            "next_rank": config.current_choice_rank,
        }
    except (AllocationError, PhaseError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/run-lottery")
def run_lottery(data: LotteryRunRequest, db: Session = Depends(get_db)):
    """Run lottery for remaining students."""
    try:
        if data.mode == "auto":
            assignments = run_lottery_auto(db)
            results = []
            for student, supervisor in assignments:
                results.append({
                    "student_id": student.id,
                    "student_name": student.name,
                    "merit_rank": student.merit_rank,
                    "supervisor_id": supervisor.id,
                    "supervisor_name": supervisor.name,
                    "assignment_type": student.assignment_type,
                })
            return {
                "message": "Lottery completed",
                "assignments": results,
                "total": len(results),
            }
        else:
            raise HTTPException(status_code=400, detail="Step mode not yet implemented")
    except (AllocationError, PhaseError) as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/results")
def get_results(db: Session = Depends(get_db)):
    """Full assignment results."""
    students = get_assignment_results(db)

    results = []
    for student in students:
        supervisor = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
        results.append({
            "student_id": student.id,
            "student_name": student.name,
            "merit_rank": student.merit_rank,
            "supervisor_id": student.supervisor_id,
            "supervisor_name": supervisor.name if supervisor else None,
            "assignment_type": student.assignment_type,
            "assignment_time": student.assignment_time,
        })

    return results


@router.get("/export")
def export_csv(db: Session = Depends(get_db)):
    """Export results as CSV."""
    students = get_assignment_results(db)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Student ID", "Name", "Merit Rank",
        "Supervisor", "Assignment Type", "Assignment Time"
    ])

    for student in students:
        supervisor = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
        writer.writerow([
            student.student_id,
            student.name,
            student.merit_rank,
            supervisor.name if supervisor else "Unassigned",
            student.assignment_type or "N/A",
            student.assignment_time.strftime("%Y-%m-%d %H:%M:%S") if student.assignment_time else "N/A",
        ])

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=thesis_results.csv"}
    )


@router.post("/undo/{student_id}")
def undo(student_id: int, db: Session = Depends(get_db)):
    """Undo a student's assignment."""
    try:
        student, supervisor = undo_assignment(db, student_id)
        return {
            "message": "Assignment undone",
            "student_id": student.id,
            "supervisor_id": supervisor.id if supervisor else None,
        }
    except AllocationError as e:
        raise HTTPException(status_code=400, detail=str(e))
