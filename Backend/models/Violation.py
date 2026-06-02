from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, LargeBinary
from database.connection import Base
from datetime import datetime

class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True)

    session_id = Column(Integer, ForeignKey("exam_sessions.id"))

    violation_id = Column(Integer, nullable=True)

    confidence = Column(Integer, nullable=True)

    timestamp = Column(DateTime, default=datetime.utcnow)

    verified = Column(String, nullable=True)

    student_photo_data = Column(LargeBinary, nullable=True)


# MULTIPLE_FACE
# PHONE_DETECTED
# FACE_NOT_VISIBLE
# TAB_SWITCH
# HEAD_MOVEMENT

print("succsessfully created violation model")