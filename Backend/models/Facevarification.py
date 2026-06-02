from sqlalchemy import Column, Integer, LargeBinary, String, ForeignKey
from database.connection import Base

class FaceVerification(Base):
    __tablename__ = "face_verifications"

    id = Column(Integer, primary_key=True)

    student_id = Column(Integer, ForeignKey("students.id"))

    verified = Column(String, default="PENDING")  # PENDING, VERIFIED, FAILED

    student_photo_data = Column(LargeBinary, nullable=True)

print("succsessfully created face verification model")  