"""Student API endpoints (scoped to batch)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List

from app.db.database import get_db
from app.deps_batches import current_batch_id, resolved_batch_id
from app.engine.batch_context import recompute_choice_privileges_for_batch
from app.engine import allocation_engine
from app.models.models import Student, Supervisor
from app.schemas.schemas import (
    StudentCreate, StudentUpdate, StudentResponse, StudentImportItem
)

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/", response_model=List[StudentResponse])
def list_students(
    db: Session = Depends(get_db),
    batch_id_res: int = Depends(resolved_batch_id),
):
    students = (
        db.query(Student)
        .filter(Student.batch_id == batch_id_res)
        .order_by(Student.merit_rank)
        .all()
    )

    result = []
    for s in students:
        resp = StudentResponse.model_validate(s)
        if s.supervisor_id:
            sup = db.query(Supervisor).filter(Supervisor.id == s.supervisor_id).first()
            resp.supervisor_name = sup.name if sup else None
        result.append(resp)
    return result


@router.post("/", response_model=StudentResponse)
def create_student(
    data: StudentCreate,
    db: Session = Depends(get_db),
    bid: int = Depends(current_batch_id),
):
    existing = (
        db.query(Student)
        .filter(
            Student.batch_id == bid,
            or_(
                Student.student_id == data.student_id,
                Student.merit_rank == data.merit_rank,
            ),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Duplicate student_id or merit_rank in this batch")

    student = Student(
        batch_id=bid,
        student_id=data.student_id,
        name=data.name,
        merit_rank=data.merit_rank,
        email=data.email,
        has_choice_privilege=False,
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    recompute_choice_privileges_for_batch(db, bid)
    db.commit()
    db.refresh(student)

    return StudentResponse.model_validate(student)


@router.post("/import")
def import_students(
    students: List[StudentImportItem],
    db: Session = Depends(get_db),
    bid: int = Depends(current_batch_id),
):
    created = 0
    errors = []

    for item in students:
        try:
            existing = (
                db.query(Student)
                .filter(
                    Student.batch_id == bid,
                    or_(
                        Student.student_id == item.student_id,
                        Student.merit_rank == item.merit_rank,
                    ),
                )
                .first()
            )

            if existing:
                errors.append({
                    "student_id": item.student_id,
                    "error": "Duplicate student_id or merit_rank in batch",
                })
                continue

            student = Student(
                batch_id=bid,
                student_id=item.student_id,
                name=item.name,
                merit_rank=item.merit_rank,
                email=item.email,
                has_choice_privilege=False,
            )
            db.add(student)
            created += 1
        except Exception as e:
            errors.append({
                "student_id": item.student_id,
                "error": str(e),
            })

    db.commit()
    recompute_choice_privileges_for_batch(db, bid)
    db.commit()

    return {
        "created": created,
        "errors": errors,
        "total_attempted": len(students),
    }


@router.get("/{student_id}", response_model=StudentResponse)
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    batch_id_res: int = Depends(resolved_batch_id),
):
    student = (
        db.query(Student)
        .filter(Student.id == student_id, Student.batch_id == batch_id_res)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    resp = StudentResponse.model_validate(student)
    if student.supervisor_id:
        sup = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
        resp.supervisor_name = sup.name if sup else None
    return resp


@router.put("/{student_id}", response_model=StudentResponse)
def update_student(
    student_id: int,
    data: StudentUpdate,
    db: Session = Depends(get_db),
    bid: int = Depends(current_batch_id),
):
    student = (
        db.query(Student)
        .filter(Student.id == student_id, Student.batch_id == bid)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    update_data = data.model_dump(exclude_unset=True)
    if "merit_rank" in update_data:
        conflict = (
            db.query(Student)
            .filter(
                Student.batch_id == bid,
                Student.id != student_id,
                Student.merit_rank == update_data["merit_rank"],
            )
            .first()
        )
        if conflict:
            raise HTTPException(status_code=400, detail="Merit rank already exists in batch")

    for field, value in update_data.items():
        setattr(student, field, value)

    db.commit()
    db.refresh(student)

    recompute_choice_privileges_for_batch(db, bid)
    db.commit()
    db.refresh(student)

    resp = StudentResponse.model_validate(student)
    if student.supervisor_id:
        sup = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
        resp.supervisor_name = sup.name if sup else None
    return resp


@router.delete("/{student_id}")
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    bid: int = Depends(current_batch_id),
):
    session_config = allocation_engine.get_session_config(db)
    if session_config.session_status != "setup":
        raise HTTPException(status_code=400, detail="Can only delete students in setup phase")

    student = (
        db.query(Student)
        .filter(Student.id == student_id, Student.batch_id == bid)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    db.delete(student)
    db.commit()
    return {"message": "Student deleted"}
