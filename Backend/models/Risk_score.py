from sqlalchemy import Column, Integer, ForeignKey, String
from database.connection import Base

class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(Integer, primary_key=True)

    session_id = Column(Integer, ForeignKey("exam_sessions.id"))

    score = Column(Integer)

    risk_level = Column(String)

print("succsessfully created risk score model")