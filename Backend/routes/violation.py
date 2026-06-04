import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from jose import JWTError

from db.database import get_db
from db.schemas import ViolationReport
from services.violation_service import report_violation
from services.auth_service import get_current_user
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


@router.post("/violation")
def report(payload: ViolationReport, db: Session = Depends(get_db), email: str = Depends(get_email_from_token)):
    user = get_current_user(db, email)
    with open(VT_PATH) as f:
        violation_types = json.load(f)
    result = report_violation(db, payload.session_id, payload.v_type_id, payload.image_path, violation_types)
    return result
