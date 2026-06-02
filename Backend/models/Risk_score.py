from sqlalchemy import Column, Integer, ForeignKey, String
from sqlalchemy.orm import relationship
from database.connection import Base

class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(Integer, primary_key=True)

    session_id = Column(Integer, ForeignKey("exam_sessions.id"))

    score = Column(Integer)

    risk_level = Column(String)

    # Relationship back to ExamSession
    exam_session = relationship("ExamSession", back_populates="risk_score")

print("succsessfully created risk score model")