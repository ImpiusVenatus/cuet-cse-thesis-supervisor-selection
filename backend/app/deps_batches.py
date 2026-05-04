"""Working batch dependency (FastAPI)."""

from typing import Optional

from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.models import Batch, SystemSettings


def ensure_system_settings_row(db: Session) -> SystemSettings:
    """Ensure singleton row id=1 exists (repairs DBs migrated without this row)."""
    row = db.query(SystemSettings).filter(SystemSettings.id == 1).first()
    if row is not None:
        return row
    fallback = db.query(Batch).order_by(Batch.id.asc()).first()
    if fallback is None:
        raise HTTPException(
            status_code=500,
            detail="Database is missing batch data and system_settings. Run `alembic upgrade head`.",
        )
    row = SystemSettings(id=1, current_batch_id=fallback.id)
    db.add(row)
    db.flush()
    return row


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
