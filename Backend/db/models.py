from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import relationship
import enum

from db.database import Base


class UserRole(str, enum.Enum):
    student = "student"
    admin = "admin"


class SessionStatus(str, enum.Enum):
    ongoing = "ongoing"
    submitted = "submitted"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(SAEnum(UserRole), nullable=False)

    exam_sessions = relationship("ExamSession", back_populates="student")
    reports = relationship("Report", back_populates="student")
    submitted_exams = relationship("SubmittedExam", back_populates="student")


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    session_id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    status = Column(SAEnum(SessionStatus), default=SessionStatus.ongoing)
    student_photo = Column(Text, nullable=True)
    risk_score = Column(Float, default=0.0)

    student = relationship("User", back_populates="exam_sessions")
    violations = relationship("Violation", back_populates="session")
    screenshots = relationship("Screenshot", back_populates="session")
    activity_logs = relationship("ActivityLog", back_populates="session")
    reports = relationship("Report", back_populates="session")
    submitted_exams = relationship("SubmittedExam", back_populates="session")


class Violation(Base):
    __tablename__ = "violations"

    violation_id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.session_id"), nullable=False)
    v_type_id = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    session = relationship("ExamSession", back_populates="violations")
    screenshots = relationship("Screenshot", back_populates="violation")


class Screenshot(Base):
    __tablename__ = "screenshots"

    screenshot_id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.session_id"), nullable=False)
    image_path = Column(String, nullable=True)
    captured_at = Column(DateTime, default=datetime.utcnow)
    violation_id = Column(Integer, ForeignKey("violations.violation_id"), nullable=True)

    session = relationship("ExamSession", back_populates="screenshots")
    violation = relationship("Violation", back_populates="screenshots")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.session_id"), nullable=False)
    activity = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    session = relationship("ExamSession", back_populates="activity_logs")


class Report(Base):
    __tablename__ = "reports"

    report_id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("exam_sessions.session_id"), nullable=False)
    pdf_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("User", back_populates="reports")
    session = relationship("ExamSession", back_populates="reports")


class SubmittedExam(Base):
    __tablename__ = "submitted_exams"

    sub_id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("exam_sessions.session_id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    score = Column(Float, nullable=True)
    answers = Column(JSON, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ExamSession", back_populates="submitted_exams")
    student = relationship("User", back_populates="submitted_exams")
