"""Batch (cohort) registry and working-batch selection."""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.deps_batches import ensure_system_settings_row, get_stored_current_batch_id
from app.models.models import Batch, SessionConfig
from app.schemas.schemas import BatchCreate, BatchResponse, SetCurrentBatchRequest

router = APIRouter(prefix="/api/batches", tags=["batches"])


@router.get("/", response_model=List[BatchResponse])
def list_batches(db: Session = Depends(get_db)):
    return db.query(Batch).order_by(Batch.id.desc()).all()


@router.post("/", response_model=BatchResponse)
def create_batch(data: BatchCreate, db: Session = Depends(get_db)):
    batch = Batch(name=data.name.strip())
    db.add(batch)
    db.flush()
    db.refresh(batch)
    db.add(SessionConfig(batch_id=batch.id))
    settings = ensure_system_settings_row(db)
    settings.current_batch_id = batch.id
    db.commit()
    db.refresh(batch)
    return batch


@router.put("/current", response_model=BatchResponse)
def set_working_batch(body: SetCurrentBatchRequest, db: Session = Depends(get_db)):
    batch = db.query(Batch).filter(Batch.id == body.batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    curr = get_stored_current_batch_id(db)
    if curr is not None and curr != body.batch_id:
        prev_cfg = db.query(SessionConfig).filter(SessionConfig.batch_id == curr).first()
        if prev_cfg and prev_cfg.session_status in ("choice_phase", "lottery_phase"):
            raise HTTPException(
                status_code=400,
                detail="Cannot switch working batch while another ceremony is in choice or lottery phase. "
                "Complete/reset first.",
            )

    settings = ensure_system_settings_row(db)
    settings.current_batch_id = body.batch_id
    db.commit()
    db.refresh(batch)
    return batch
