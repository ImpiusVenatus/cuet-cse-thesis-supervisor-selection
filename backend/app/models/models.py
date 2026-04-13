from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.database import Base


class Supervisor(Base):
    __tablename__ = "supervisors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    designation = Column(String(50), nullable=False)  # Professor, Assoc. Prof., Asst. Prof., Lecturer
    email = Column(String(200), unique=True, nullable=True)
    total_capacity = Column(Integer, nullable=False)
    choice_capacity = Column(Integer, nullable=False)
    lottery_capacity = Column(Integer, nullable=False)
    choice_filled = Column(Integer, default=0)
    lottery_filled = Column(Integer, default=0)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    students = relationship("Student", back_populates="supervisor")
    events = relationship("EventLog", back_populates="supervisor")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String(50), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    merit_rank = Column(Integer, unique=True, nullable=False)
    email = Column(String(200), unique=True, nullable=True)
    has_choice_privilege = Column(Boolean, default=False)
    has_forfeited = Column(Boolean, default=False)
    forfeit_order = Column(Integer, nullable=True)
    supervisor_id = Column(Integer, ForeignKey("supervisors.id"), nullable=True)
    assignment_type = Column(String(10), nullable=True)  # "choice" or "lottery"
    assignment_time = Column(DateTime, nullable=True)

    # Relationships
    supervisor = relationship("Supervisor", back_populates="students")
    events = relationship("EventLog", back_populates="student")


class SessionConfig(Base):
    __tablename__ = "session_config"

    id = Column(Integer, primary_key=True, default=1)
    total_students = Column(Integer, default=0)
    choice_threshold = Column(Integer, default=0)
    session_status = Column(String(20), default="setup")  # setup, choice_phase, lottery_phase, completed
    current_choice_rank = Column(Integer, default=1)
    forfeit_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EventLog(Base):
    __tablename__ = "event_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(50), nullable=False)  # CHOICE_MADE, FORFEITED, LOTTERY_ASSIGNED, PHASE_CHANGE, etc.
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    supervisor_id = Column(Integer, ForeignKey("supervisors.id"), nullable=True)
    event_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    student = relationship("Student", back_populates="events")
    supervisor = relationship("Supervisor", back_populates="events")
