from sqlalchemy import ForeignKey, Integer, String, Column 
from sqlalchemy.orm import relationship
from database.connection import Base

class Exam(Base):
    __tablename__ = "exams"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable = False)
    duration = Column(Integer, nullable = False)
    subject = Column(String, nullable = False)
    total_marks = Column(Integer, nullable = False)
    owner = Column(Integer, ForeignKey("students.id"))

    Student = relationship('Student', back_populates='Exam')


print("succsessfully created exam model")

