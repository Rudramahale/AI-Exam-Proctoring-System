from sqlalchemy import Column, Integer, String, ForeignKey
from database.connection import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)

    session_id = Column(Integer, ForeignKey("exam_sessions.id"))

    pdf_path = Column(String)

print("succsessfully created report model")