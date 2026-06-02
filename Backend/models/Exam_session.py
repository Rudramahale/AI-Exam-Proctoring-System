from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, LargeBinary
from database.connection import Base
from datetime import datetime

class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id = Column(Integer, primary_key=True)

    student_id = Column(Integer, ForeignKey("students.id"))
    exam_id = Column(Integer, ForeignKey("exams.id"))

    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)

    status = Column(String, default="ACTIVE")

    student_photo_data = Column(LargeBinary, nullable=True)


# 0-30   = LOW
# 31-70  = MEDIUM
# 71-100 = HIGH

print("succsessfully created exam session model")