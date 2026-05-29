from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from database.connection import Base
from datetime import datetime

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True)

    session_id = Column(Integer, ForeignKey("exam_sessions.id"))

    activity = Column(String)

    timestamp = Column(DateTime, default=datetime.utcnow)