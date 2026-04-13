"""Supervisor API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.models import Supervisor
from app.schemas.schemas import (
    SupervisorCreate, SupervisorUpdate, SupervisorResponse
)
from app.engine import allocation_engine

router = APIRouter(prefix="/api/supervisors", tags=["supervisors"])


@router.get("/", response_model=List[SupervisorResponse])
def list_supervisors(db: Session = Depends(get_db)):
    """List all supervisors with slot counts."""
    supervisors = db.query(Supervisor).all()
    return supervisors


@router.post("/", response_model=SupervisorResponse)
def create_supervisor(data: SupervisorCreate, db: Session = Depends(get_db)):
    """Create a new supervisor."""
    supervisor = Supervisor(
        name=data.name,
        designation=data.designation.value,
        email=data.email,
        total_capacity=data.total_capacity,
        choice_capacity=data.choice_capacity,
        lottery_capacity=data.lottery_capacity,
    )
    db.add(supervisor)
    db.commit()
    db.refresh(supervisor)
    return supervisor


@router.get("/{supervisor_id}", response_model=SupervisorResponse)
def get_supervisor(supervisor_id: int, db: Session = Depends(get_db)):
    """Get a single supervisor by ID."""
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")
    return supervisor


@router.put("/{supervisor_id}", response_model=SupervisorResponse)
def update_supervisor(supervisor_id: int, data: SupervisorUpdate, db: Session = Depends(get_db)):
    """Update a supervisor."""
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "designation" and value is not None:
            setattr(supervisor, field, value.value)
        else:
            setattr(supervisor, field, value)

    db.commit()
    db.refresh(supervisor)
    return supervisor


@router.delete("/{supervisor_id}")
def delete_supervisor(supervisor_id: int, db: Session = Depends(get_db)):
    """Remove a supervisor (only if no students assigned)."""
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    assigned_count = db.query(allocation_engine.Student).filter(
        allocation_engine.Student.supervisor_id == supervisor_id
    ).count()

    if assigned_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete supervisor with {assigned_count} assigned students"
        )

    db.delete(supervisor)
    db.commit()
    return {"message": "Supervisor deleted"}


@router.patch("/{supervisor_id}/availability", response_model=SupervisorResponse)
def toggle_availability(supervisor_id: int, db: Session = Depends(get_db)):
    """Toggle supervisor availability."""
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    supervisor.is_available = not supervisor.is_available
    db.commit()
    db.refresh(supervisor)
    return supervisor
