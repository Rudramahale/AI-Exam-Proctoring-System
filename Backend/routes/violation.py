from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from jose import JWTError

from db.database import get_db
from db.schemas import ViolationReport
from services.violation_service import report_violation
from utils.jwt_utils import decode_access_token

router = APIRouter()


def get_email_from_token(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token header")
    token = authorization.split(" ", 1)[1]
    try:
        return decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/violation")
def report(request: Request, payload: ViolationReport, db: Session = Depends(get_db), email: str = Depends(get_email_from_token)):
    # Use cached violation types from app.state — no disk I/O per request
    violation_types = request.app.state.violation_types
    result = report_violation(db, payload.session_id, payload.v_type_id, payload.image_path, violation_types)
    return result
