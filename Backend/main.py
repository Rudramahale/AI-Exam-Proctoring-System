from fastapi import FastAPI, HTTPException, status, Header, Depends
from fastapi.security import HTTPBearer 
from api.auth_utils.jwt import hash_password, verify_password,create_access_token
from database.connection import SessionLocal
from schemas.user_schemas import UserCreate, UserLogin, TokenResponse
from sqlalchemy.orm import Session
from models.user_model import User
from schemas.user_schemas import UserCreate

app = FastAPI()
security = HTTPBearer()

def get_db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@app.post("/signup")
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

@app.post("/login")
def login_user(user: UserLogin, db: Session = Depends(get_db)):
    # Find user by email
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid email or password")

    # Verify password
    if not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    # Generate JWT token
    access_token = create_access_token(data={"sub": db_user.email})
    
    return TokenResponse(access_token=access_token, token_type="bearer")

