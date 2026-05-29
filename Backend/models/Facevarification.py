from sqlalchemy import Column, Integer, String, ForeignKey
from database.connection import Base

class FaceVerification(Base):
    __tablename__ = "face_verifications"

    id = Column(Integer, primary_key=True)

    student_id = Column(Integer, ForeignKey("students.id"))

    verified = Column(String)

    confidence = Column(Integer)