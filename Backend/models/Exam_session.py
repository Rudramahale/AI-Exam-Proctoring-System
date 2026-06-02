from sqlalchemy import Column, Integer, LargeBinary, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from database.connection import Base
from datetime import datetime

class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(Integer, primary_key=True)
    student_id = Column(Integer, ForeignKey("students.id"))
    # exam_id = Column(Integer, ForeignKey("exams.id"))

    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    status = Column(String, default="ACTIVE")

    # This maps to the BYTEA column in Neon (PostgreSQL)
    student_photo_data = Column(LargeBinary, nullable=True)

    risk_score = relationship("RiskScore", back_populates="exam_session", uselist=False)

# 0-30   = LOW
# 31-70  = MEDIUM
# 71-100 = HIGH

print("succsessfully created exam session model")