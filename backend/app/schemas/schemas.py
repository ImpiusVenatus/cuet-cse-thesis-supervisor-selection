from pydantic import BaseModel, Field, model_validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


def validate_supervisor_capacities(
    *, total_capacity: int, choice_capacity: int, lottery_capacity: int
) -> None:
    """Arithmetic rules plus shared single-seat (total 1 + both quotas ≥ 1)."""
    t, c, l = total_capacity, choice_capacity, lottery_capacity
    if t == 0:
        if c != 0 or l != 0:
            raise ValueError(
                "When total_capacity is 0, choice_capacity and lottery_capacity must be 0"
            )
        return
    if c > t or l > t:
        raise ValueError("choice_capacity and lottery_capacity cannot exceed total_capacity")

    flexible_single = t == 1 and c >= 1 and l >= 1
    if flexible_single:
        return
    if c + l > t:
        raise ValueError(
            "choice_capacity + lottery_capacity cannot exceed total_capacity "
            "(use total 1 with choice ≥ 1 and lottery ≥ 1 for one student in either phase)"
        )


# ============ Enums ============

class Designation(str, Enum):
    PROFESSOR = "Professor"
    ASSOC_PROF = "Assoc. Prof."
    ASST_PROF = "Asst. Prof."
    LECTURER = "Lecturer"


class SessionStatus(str, Enum):
    SETUP = "setup"
    CHOICE_PHASE = "choice_phase"
    LOTTERY_PHASE = "lottery_phase"
    COMPLETED = "completed"


class AssignmentType(str, Enum):
    CHOICE = "choice"
    LOTTERY = "lottery"


class EventType(str, Enum):
    CHOICE_MADE = "CHOICE_MADE"
    FORFEITED = "FORFEITED"
    LOTTERY_ASSIGNED = "LOTTERY_ASSIGNED"
    PHASE_CHANGE = "PHASE_CHANGE"
    SESSION_SETUP = "SESSION_SETUP"
    SESSION_RESET = "SESSION_RESET"
    STUDENT_SKIPPED = "STUDENT_SKIPPED"


# ============ Supervisor Schemas ============

class SupervisorBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    designation: Designation
    email: Optional[str] = None
    total_capacity: int = Field(..., ge=0)
    choice_capacity: int = Field(..., ge=0)
    lottery_capacity: int = Field(..., ge=0)


class SupervisorCreate(SupervisorBase):
    @model_validator(mode="after")
    def _capacities(self):
        validate_supervisor_capacities(
            total_capacity=self.total_capacity,
            choice_capacity=self.choice_capacity,
            lottery_capacity=self.lottery_capacity,
        )
        return self


class SupervisorUpdate(BaseModel):
    name: Optional[str] = None
    designation: Optional[Designation] = None
    email: Optional[str] = None
    total_capacity: Optional[int] = None
    choice_capacity: Optional[int] = None
    lottery_capacity: Optional[int] = None
    is_available: Optional[bool] = None


class SupervisorResponse(SupervisorBase):
    id: int
    choice_filled: int
    lottery_filled: int
    is_available: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Student Schemas ============

class StudentBase(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    merit_rank: int = Field(..., ge=1)
    email: Optional[str] = None


class StudentCreate(StudentBase):
    """Privilege is computed from session choice threshold — not supplied by client."""

    pass


class StudentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    merit_rank: Optional[int] = None


class StudentResponse(StudentBase):
    id: int
    batch_id: int
    has_choice_privilege: bool
    has_forfeited: bool
    forfeit_order: Optional[int]
    supervisor_id: Optional[int]
    supervisor_name: Optional[str] = None
    assignment_type: Optional[str]
    assignment_time: Optional[datetime]

    class Config:
        from_attributes = True


class StudentImportItem(BaseModel):
    student_id: str
    name: str
    merit_rank: int
    email: Optional[str] = None


# ============ Session Config Schemas ============

class SessionConfigBase(BaseModel):
    total_students: int = 0
    choice_threshold: int = 0
    session_status: SessionStatus = SessionStatus.SETUP
    current_choice_rank: int = 1
    forfeit_count: int = 0


class SessionSetup(BaseModel):
    total_students: int = Field(..., ge=1)
    choice_threshold: int = Field(..., ge=0)


class SessionConfigResponse(SessionConfigBase):
    id: int
    batch_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BatchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class BatchResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class SetCurrentBatchRequest(BaseModel):
    batch_id: int


# ============ Allocation Schemas ============

class ChoiceRequest(BaseModel):
    student_id: int
    supervisor_id: int


class ForfeitRequest(BaseModel):
    student_id: int


class SkipRequest(BaseModel):
    student_id: int


class LotteryRunRequest(BaseModel):
    mode: str = "auto"  # "auto" or "step"


class QueueState(BaseModel):
    phase: str
    current_student: Optional[StudentResponse] = None
    queue: List[StudentResponse] = []
    forfeited_students: List[StudentResponse] = []


class AssignmentResult(BaseModel):
    student_id: int
    student_name: str
    merit_rank: int
    supervisor_id: int
    supervisor_name: str
    assignment_type: str
    assignment_time: datetime


# ============ WebSocket Schemas ============

class WebSocketMessage(BaseModel):
    type: str  # slot_update, queue_advance, assignment_made, phase_change, supervisor_update
    data: dict
