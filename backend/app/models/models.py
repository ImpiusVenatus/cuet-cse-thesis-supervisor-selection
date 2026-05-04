from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.database import Base


class Batch(Base):
    __tablename__ = "batches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    students = relationship("Student", back_populates="batch")
    session_configs = relationship("SessionConfig", back_populates="batch")
    supervisor_usages = relationship("SupervisorUsage", back_populates="batch")


class SystemSettings(Base):
    """Singleton row id=1: which batch Ceremony UI and mutations apply to."""

    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True)
    current_batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)

    current_batch = relationship("Batch")


class Supervisor(Base):
    __tablename__ = "supervisors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    designation = Column(String(50), nullable=False)
    email = Column(String(200), unique=True, nullable=True)
    total_capacity = Column(Integer, nullable=False)
    choice_capacity = Column(Integer, nullable=False)
    lottery_capacity = Column(Integer, nullable=False)
    # Legacy totals; authoritative per-batch fills live in SupervisorUsage for new logic.
    choice_filled = Column(Integer, default=0)
    lottery_filled = Column(Integer, default=0)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    students = relationship("Student", back_populates="supervisor")
    events = relationship("EventLog", back_populates="supervisor")
    usages = relationship("SupervisorUsage", back_populates="supervisor")


class SupervisorUsage(Base):
    """Per-batch slot consumption; capacities still come from Supervisor."""

    __tablename__ = "supervisor_usage"

    batch_id = Column(Integer, ForeignKey("batches.id"), primary_key=True)
    supervisor_id = Column(Integer, ForeignKey("supervisors.id"), primary_key=True)
    choice_filled = Column(Integer, nullable=False, default=0)
    lottery_filled = Column(Integer, nullable=False, default=0)

    batch = relationship("Batch", back_populates="supervisor_usages")
    supervisor = relationship("Supervisor", back_populates="usages")


class Student(Base):
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("batch_id", "student_id", name="uq_students_batch_student_id"),
        UniqueConstraint("batch_id", "merit_rank", name="uq_students_batch_merit_rank"),
        UniqueConstraint("batch_id", "email", name="uq_students_batch_email"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False)
    student_id = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    merit_rank = Column(Integer, nullable=False)
    email = Column(String(200), nullable=True)
    has_choice_privilege = Column(Boolean, default=False)
    has_forfeited = Column(Boolean, default=False)
    forfeit_order = Column(Integer, nullable=True)
    supervisor_id = Column(Integer, ForeignKey("supervisors.id"), nullable=True)
    assignment_type = Column(String(10), nullable=True)
    assignment_time = Column(DateTime, nullable=True)

    batch = relationship("Batch", back_populates="students")
    supervisor = relationship("Supervisor", back_populates="students")
    events = relationship("EventLog", back_populates="student")


class SessionConfig(Base):
    __tablename__ = "session_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=False, unique=True)
    total_students = Column(Integer, default=0)
    choice_threshold = Column(Integer, default=0)
    session_status = Column(String(20), default="setup")
    current_choice_rank = Column(Integer, default=1)
    forfeit_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    batch = relationship("Batch", back_populates="session_configs")


class EventLog(Base):
    __tablename__ = "event_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    batch_id = Column(Integer, ForeignKey("batches.id"), nullable=True)
    event_type = Column(String(50), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    supervisor_id = Column(Integer, ForeignKey("supervisors.id"), nullable=True)
    event_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("Student", back_populates="events")
    supervisor = relationship("Supervisor", back_populates="events")
    batch = relationship("Batch")
