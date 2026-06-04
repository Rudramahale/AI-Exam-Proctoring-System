import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from jose import JWTError

from db.database import get_db
from db.models import User, UserRole
from db.schemas import ReportRequest, ReportResponse
from services.report_service import generate_report
from utils.jwt_utils import decode_access_token

router = APIRouter()
VT_PATH = Path(__file__).parent.parent / "violation_types.json"


def get_admin_from_token(authorization: str = Header(...)) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token header")
    token = authorization.split(" ", 1)[1]
    try:
        email = decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    db = next(get_db())
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user or user.role != UserRole.admin:
            raise HTTPException(status_code=403, detail="Admin access required")
        return user
    finally:
        db.close()


@router.post("/generate_report", response_model=ReportResponse)
def create_report(payload: ReportRequest, db: Session = Depends(get_db), admin: User = Depends(get_admin_from_token)):
    with open(VT_PATH) as f:
        vt = json.load(f)
    result = generate_report(db, payload.session_id, vt)
    return ReportResponse(**result)
