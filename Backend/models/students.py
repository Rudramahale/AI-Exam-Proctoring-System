from sqlalchemy import Integer, String, Column 
from database.connection import Base 

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key = True)
    name = Column(String, nullable = False)
    email = Column(String, nullable = False, unique = True)
    password = Column(String, nullable = False)

    
