from database.connection import SessionLocal, Base, engine
from sqlalchemy.orm import Session 
from models.user_model import User
import api.auth_utils.jwt as verify_password

Session = SessionLocal() 
session = Session 

hashed = session.query(User).filter(User.name == 'rudra').first()
print(hashed)
print(verify_password('thebhoi', hashed))