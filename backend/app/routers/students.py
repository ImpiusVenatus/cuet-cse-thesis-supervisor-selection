"""Student API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Student, Supervisor
from app.schemas.schemas import (
    StudentCreate, StudentUpdate, StudentResponse, StudentImportItem
)

router = APIRouter(prefix="/api/students", tags=["students"])


@router.get("/", response_model=List[StudentResponse])
def list_students(db: Session = Depends(get_db)):
    """List all students with assignment status."""
    students = db.query(Student).order_by(Student.merit_rank).all()

    # Enrich with supervisor name
    result = []
    for s in students:
        resp = StudentResponse.model_validate(s)
        if s.supervisor_id:
            sup = db.query(Supervisor).filter(Supervisor.id == s.supervisor_id).first()
            resp.supervisor_name = sup.name if sup else None
        result.append(resp)
    return result


@router.post("/", response_model=StudentResponse)
def create_student(data: StudentCreate, db: Session = Depends(get_db)):
    """Create a single student."""
    # Check for duplicate student_id
    existing = db.query(Student).filter(Student.student_id == data.student_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Student ID already exists")

    # Check for duplicate merit_rank
    existing = db.query(Student).filter(Student.merit_rank == data.merit_rank).first()
    if existing:
        raise HTTPException(status_code=400, detail="Merit rank already exists")

    student = Student(
        student_id=data.student_id,
        name=data.name,
        merit_rank=data.merit_rank,
        email=data.email,
        has_choice_privilege=data.has_choice_privilege,
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    resp = StudentResponse.model_validate(student)
    return resp


@router.post("/import")
def import_students(students: List[StudentImportItem], db: Session = Depends(get_db)):
    """Bulk import students from JSON/CSV data."""
    created = 0
    errors = []

    for item in students:
        try:
            # Check for duplicates
            existing = db.query(Student).filter(
                (Student.student_id == item.student_id) |
                (Student.merit_rank == item.merit_rank)
            ).first()

            if existing:
                errors.append({
                    "student_id": item.student_id,
                    "error": "Duplicate student_id or merit_rank"
                })
                continue

            student = Student(
                student_id=item.student_id,
                name=item.name,
                merit_rank=item.merit_rank,
                email=item.email,
                has_choice_privilege=item.has_choice_privilege,
            )
            db.add(student)
            created += 1
        except Exception as e:
            errors.append({
                "student_id": item.student_id,
                "error": str(e)
            })

    db.commit()

    return {
        "created": created,
        "errors": errors,
        "total_attempted": len(students),
    }


@router.get("/{student_id}", response_model=StudentResponse)
def get_student(student_id: int, db: Session = Depends(get_db)):
    """Get student detail."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    resp = StudentResponse.model_validate(student)
    if student.supervisor_id:
        sup = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
        resp.supervisor_name = sup.name if sup else None
    return resp


@router.put("/{student_id}", response_model=StudentResponse)
def update_student(student_id: int, data: StudentUpdate, db: Session = Depends(get_db)):
    """Update student."""
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(student, field, value)

    db.commit()
    db.refresh(student)

    resp = StudentResponse.model_validate(student)
    if student.supervisor_id:
        sup = db.query(Supervisor).filter(Supervisor.id == student.supervisor_id).first()
        resp.supervisor_name = sup.name if sup else None
    return resp


@router.delete("/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db)):
    """Remove student (setup phase only)."""
    from app.engine import allocation_engine

    session_config = allocation_engine.get_session_config(db)
    if session_config.session_status != "setup":
        raise HTTPException(status_code=400, detail="Can only delete students in setup phase")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    db.delete(student)
    db.commit()
    return {"message": "Student deleted"}
