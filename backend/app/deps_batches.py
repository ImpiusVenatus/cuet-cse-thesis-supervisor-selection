"""Working batch dependency (FastAPI)."""

from typing import Optional

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import SystemSettings


def get_stored_current_batch_id(db: Session) -> Optional[int]:
    row = db.query(SystemSettings).filter(SystemSettings.id == 1).first()
    return row.current_batch_id if row else None


def current_batch_id(db: Session = Depends(get_db)) -> int:
    bid = get_stored_current_batch_id(db)
    if bid is None:
        raise HTTPException(
            status_code=400,
            detail="No working batch is selected. Open Batches and create one or set the current batch.",
        )
    return bid


def resolved_batch_id(
    db: Session = Depends(get_db),
    batch_id: Optional[int] = Query(
        None, description="Filter to a cohort; defaults to the working batch."
    ),
) -> int:
    if batch_id is not None:
        return batch_id
    bid = get_stored_current_batch_id(db)
    if bid is None:
        raise HTTPException(
            status_code=400,
            detail="No working batch is selected. Open Batches and set the current batch.",
        )
    return bid
