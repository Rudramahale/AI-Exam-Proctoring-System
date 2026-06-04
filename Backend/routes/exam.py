import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Form
from sqlalchemy.orm import Session
from jose import JWTError

from db.database import get_db
from db.schemas import StartExamRequest, StartExamResponse, EndExamRequest, EndExamResponse
from services.exam_service import start_exam, end_exam
from services.auth_service import get_current_user
from services.report_service import generate_report
from utils.jwt_utils import decode_access_token

router = APIRouter()
VT_PATH = Path(__file__).parent.parent / "violation_types.json"


def get_email_from_token(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token header")
    token = authorization.split(" ", 1)[1]
    try:
        return decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/start_exam", response_model=StartExamResponse)
def start(payload: StartExamRequest, db: Session = Depends(get_db), email: str = Depends(get_email_from_token)):
    user = get_current_user(db, email)
    result = start_exam(db, user.id, payload.student_photo)
    return StartExamResponse(**result)


@router.post("/end_exam", response_model=EndExamResponse)
def end(payload: EndExamRequest, db: Session = Depends(get_db), email: str = Depends(get_email_from_token)):
    user = get_current_user(db, email)
    end_exam(db, payload.session_id, user.id, payload.answers, payload.score)
    with open(VT_PATH) as f:
        vt = json.load(f)
    report_result = generate_report(db, payload.session_id, vt)
    return EndExamResponse(message="Exam submitted", report_id=report_result["report_id"])


@router.post("/monitor-frame")
async def monitor_frame(
    session_id: int = Form(...),
    photo: UploadFile = File(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_email_from_token),
):
    user = get_current_user(db, email)
    return {"message": "Frame received", "session_id": session_id}
