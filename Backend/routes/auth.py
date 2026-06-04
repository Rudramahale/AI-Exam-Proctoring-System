from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from db.schemas import UserSignup, UserLogin, TokenResponse, SignupResponse
from services.auth_service import signup, login

router = APIRouter()


@router.post("/sign_up", response_model=SignupResponse)
def sign_up(payload: UserSignup, db: Session = Depends(get_db)):
    result = signup(db, payload.name, payload.email, payload.password, payload.role)
    return SignupResponse(**result)


@router.post("/login", response_model=TokenResponse)
def log_in(payload: UserLogin, db: Session = Depends(get_db)):
    result = login(db, payload.email, payload.password)
    return TokenResponse(**result)
