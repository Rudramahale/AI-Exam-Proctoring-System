from sqlalchemy import Column, Integer, String, ForeignKey
from database.connection import Base

class Screenshot(Base):
    __tablename__ = "screenshots"

    id = Column(Integer, primary_key=True)

    session_id = Column(Integer, ForeignKey("exam_sessions.id"))

    image_path = Column(String)

    violation_type = Column(String)