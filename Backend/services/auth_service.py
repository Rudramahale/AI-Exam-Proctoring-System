from sqlalchemy.orm import Session
from fastapi import HTTPException

from db.models import User, UserRole
from utils.jwt_utils import hash_password, verify_password, create_access_token


def signup(db: Session, name: str, email: str, password: str, role: str) -> dict:
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = hash_password(password)
    user = User(name=name, email=email, password=hashed, role=UserRole(role))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(data={"sub": user.email, "role": user.role.value})
    return {
        "message": "User created",
        "user_id": user.id,
        "access_token": token,
        "token_type": "bearer",
    }


def login(db: Session, email: str, password: str) -> dict:
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    token = create_access_token(data={"sub": user.email, "role": user.role.value})
    return {"access_token": token, "token_type": "bearer", "user_id": user.id, "role": user.role.value}


def get_current_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
