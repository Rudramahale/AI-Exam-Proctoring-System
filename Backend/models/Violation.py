from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from database.connection import Base
from datetime import datetime

class Violation(Base):
    __tablename__ = "violations"

    id = Column(Integer, primary_key=True)

    session_id = Column(Integer, ForeignKey("exam_sessions.id"))

    violation_id = Column(Integer)

    confidence = Column(Integer)

    timestamp = Column(DateTime, default=datetime.utcnow)

# MULTIPLE_FACE
# PHONE_DETECTED
# FACE_NOT_VISIBLE
# TAB_SWITCH
# HEAD_MOVEMENT

print("succsessfully created violation model")