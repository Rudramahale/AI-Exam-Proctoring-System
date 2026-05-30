from sqlalchemy import Integer, String, Column, Boolean
from database.connection import Base 

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    role = Column(String)  # "student" or "admin"
    is_active = Column(Boolean, default=True)  # 1 for active, 0 for inactive
    created_at = Column(String)

print("succsessfully created user model")

