from datetime import datetime
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer 
from models.Violation import Violation
from schemas.violation import ViolationCreate
from models.Activity_log import ActivityLog
from models.Exam_session import ExamSession
from models.Risk_score import RiskScore
from api.auth_utils.jwt import hash_password, verify_password, create_access_token
from database.connection import SessionLocal
from schemas.user_schemas import UserCreate, UserLogin, TokenResponse, EndExamRequest, ExamResultResponse
from sqlalchemy.orm import Session
from models.user_model import User
from utils.presence_of_person import detect_person


app = FastAPI()
security = HTTPBearer()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    
    return TokenResponse(access_token=access_token, token_type="bearer", user_id=new_user.id)

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
    
    return TokenResponse(access_token=access_token, token_type="bearer", user_id=db_user.id)


@app.post("/start-exam")
async def start_exam(id: int = Form(...), student_name: str = Form(...), photo: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        image_bytes = await photo.read()

        new_session = ExamSession(
            student_id=id,
            student_photo_data=image_bytes,
            status="ACTIVE"
        )
        db.add(new_session)
        db.flush()

        initial_risk_score = RiskScore(
            session_id=new_session.id,
            score=0
        )
        db.add(initial_risk_score)

        activity_log = ActivityLog(
            session_id=new_session.id,
            activity=f"Started exam session ID: {new_session.id}"
        )
        db.add(activity_log)

        db.commit()

        return { 
            "message": "Exam initialized successfully", 
            "session_id": new_session.id,
            "start_time": new_session.start_time.isoformat() if new_session.start_time else ""
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to start exam: {str(e)}")


@app.post("/end-exam")
def end_exam(request: EndExamRequest, db: Session = Depends(get_db)):
    db_session = db.query(ExamSession).filter(ExamSession.id == request.session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    db_session.end_time = datetime.utcnow()
    db_session.status = "COMPLETED"
    
    activity_log = ActivityLog(
        session_id=request.session_id,
        activity=f"Completed exam session ID: {request.session_id}"
    )
    db.add(activity_log)
    db.commit()

    return ExamResultResponse(
        message="Exam ended successfully",
        session_id=request.session_id,
        start_time=db_session.start_time.isoformat() if db_session.start_time else "",
        end_time=db_session.end_time.isoformat() if db_session.end_time else ""
    )

@app.post("/log-violation") #for fronted to log {tab switch, fullscreen exit, camera_Blocked voilations}
async def log_violation(violation: ViolationCreate, db: Session = Depends(get_db)):
    try:
        violation_time = datetime.utcnow()

        violation_record = Violation(
            session_id=violation.session_id,
            violation_id=violation.violation_id,
            confidence = 100,
            timestamp = violation_time
        )

        activity_log = ActivityLog(
            session_id=violation.session_id,
            activity=f"Violation detected: {violation.violation_type}",
            timestamp = violation_time
        )

        db.add(violation_record)
        db.add(activity_log)
        db.commit()
        return {"message": "Violation logged successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to log violation: {str(e)}")
    
@app.post("/monitor-frame")
async def monitor_frame(
    session_id: int = Form(...),
    frame: UploadFile = File(...),
    student_id: int = Form(...),
    timestamp: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        image_bytes = await frame.read()
        
        # Verify that the session exists
        db_session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Exam session not found")
        
        # Detect person in frame
        result = detect_person(image_bytes)

        if result == "No person detected":
            violation_time = datetime.utcnow()
            violation_record = Violation(
                session_id=session_id,
                verified="FAILED",
                student_photo_data=image_bytes
            )
            activity_log = ActivityLog(
                session_id=session_id,
                activity=f"Violation detected: No person in frame at {timestamp}",
                timestamp=violation_time
            )
            db.add(violation_record)
            db.add(activity_log)
            db.commit()
            return {
                "message": "No person detected. Violation logged.",
                "session_id": session_id,
                "student_id": student_id,
                "frame_timestamp": timestamp
            }
        else:
            # Log successful frame capture (optional - only for verbose logging)
            # You can comment this out if you want to reduce database writes
            activity_log = ActivityLog(
                session_id=session_id,
                activity=f"Frame captured and processed successfully at {timestamp}",
                timestamp=datetime.utcnow()
            )
            db.add(activity_log)
            db.commit()
            
            return {
                "message": "Person detected. Frame processed successfully.",
                "session_id": session_id,
                "student_id": student_id,
                "frame_timestamp": timestamp
            }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process frame: {str(e)}")
            




