from sqlalchemy import Column, Integer, String
from database.connection import Base

class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True)

    username = Column(String, unique=True)

    password = Column(String)

print("succsessfully created admin model")