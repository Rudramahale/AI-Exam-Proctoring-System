from sqlalchemy.orm import Session

from database.connection import SessionLocal
from schemas.user_schemas import UserCreate, UserLogin, TokenResponse
from api.auth_utils import hash_password, create_access_token
from fastapi import Depends, HTTPException, status
from models.user_model import User

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def signup_user(user : UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash the password
    hashed_password = hash_password(user.password)

    # Create new user record
    new_user = User(
        name=user.name,
        email=user.email,
        hashed_password=hashed_password,
        role="student",  # Default role
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Generate JWT token for the new user
    access_token = create_access_token(data={"sub": new_user.email})
    
    return TokenResponse(access_token=access_token, token_type="bearer")

