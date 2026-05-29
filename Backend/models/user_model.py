from sqlalchemy import Integer, String, Column
from database.connection import Base 

class user(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    email = Column(String, unique=True)
    hashed_password = Column(String)
    role = Column(String)  # "student" or "admin"
    is_active = Column(Integer, default=1)  # 1 for active, 0 for inactive
    created_at = Column(String)

print("succsessfully created user model")

