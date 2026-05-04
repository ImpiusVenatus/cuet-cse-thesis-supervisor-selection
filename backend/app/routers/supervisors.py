"""Supervisor API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.deps_batches import current_batch_id
from app.models.models import Supervisor, SupervisorUsage, Student
from app.schemas.schemas import (
    SupervisorCreate,
    SupervisorUpdate,
    SupervisorResponse,
    validate_supervisor_capacities,
)

router = APIRouter(prefix="/api/supervisors", tags=["supervisors"])


@router.get("/", response_model=List[SupervisorResponse])
def list_supervisors(
    db: Session = Depends(get_db),
    bid: int = Depends(current_batch_id),
):
    usages = {
        u.supervisor_id: u
        for u in db.query(SupervisorUsage).filter(SupervisorUsage.batch_id == bid).all()
    }
    supervisors = db.query(Supervisor).order_by(Supervisor.id).all()
    result = []
    for s in supervisors:
        u = usages.get(s.id)
        cf = u.choice_filled if u else 0
        lf = u.lottery_filled if u else 0
        resp = SupervisorResponse.model_validate(s)
        result.append(resp.model_copy(update={"choice_filled": cf, "lottery_filled": lf}))
    return result


@router.post("/", response_model=SupervisorResponse)
def create_supervisor(data: SupervisorCreate, db: Session = Depends(get_db)):
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
def get_supervisor(
    supervisor_id: int,
    db: Session = Depends(get_db),
    bid: int = Depends(current_batch_id),
):
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")
    u = (
        db.query(SupervisorUsage)
        .filter(
            SupervisorUsage.batch_id == bid,
            SupervisorUsage.supervisor_id == supervisor_id,
        )
        .first()
    )
    cf = u.choice_filled if u else 0
    lf = u.lottery_filled if u else 0
    resp = SupervisorResponse.model_validate(supervisor)
    return resp.model_copy(update={"choice_filled": cf, "lottery_filled": lf})


@router.put("/{supervisor_id}", response_model=SupervisorResponse)
def update_supervisor(supervisor_id: int, data: SupervisorUpdate, db: Session = Depends(get_db)):
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    update_data = data.model_dump(exclude_unset=True)
    merged_total = update_data.get("total_capacity", supervisor.total_capacity)
    merged_choice = update_data.get("choice_capacity", supervisor.choice_capacity)
    merged_lotto = update_data.get("lottery_capacity", supervisor.lottery_capacity)
    try:
        validate_supervisor_capacities(
            total_capacity=merged_total,
            choice_capacity=merged_choice,
            lottery_capacity=merged_lotto,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

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
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    assigned_count = db.query(Student).filter(Student.supervisor_id == supervisor_id).count()

    if assigned_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete supervisor with {assigned_count} assigned students"
        )

    db.delete(supervisor)
    db.commit()
    return {"message": "Supervisor deleted"}


@router.patch("/{supervisor_id}/availability", response_model=SupervisorResponse)
def toggle_availability(
    supervisor_id: int,
    db: Session = Depends(get_db),
    bid: int = Depends(current_batch_id),
):
    supervisor = db.query(Supervisor).filter(Supervisor.id == supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    supervisor.is_available = not supervisor.is_available
    db.commit()
    db.refresh(supervisor)
    u = (
        db.query(SupervisorUsage)
        .filter(
            SupervisorUsage.batch_id == bid,
            SupervisorUsage.supervisor_id == supervisor_id,
        )
        .first()
    )
    cf = u.choice_filled if u else 0
    lf = u.lottery_filled if u else 0
    resp = SupervisorResponse.model_validate(supervisor)
    return resp.model_copy(update={"choice_filled": cf, "lottery_filled": lf})
