import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from jose import JWTError

from db.database import get_db
from db.models import User, ExamSession, SessionStatus, SubmittedExam, Violation, ActivityLog, UserRole
from db.schemas import AdminDashboardResponse, SessionInfo, StudentSummary, ActivityLogEntry
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


@router.get("/admin", response_model=AdminDashboardResponse)
def admin_dashboard(db: Session = Depends(get_db), admin: User = Depends(get_admin_from_token)):
    ongoing_sessions = db.query(ExamSession).filter(ExamSession.status == SessionStatus.ongoing).all()
    submitted_sessions = db.query(ExamSession).filter(ExamSession.status == SessionStatus.submitted).all()

    ongoing = []
    for s in ongoing_sessions:
        student = db.query(User).filter(User.id == s.student_id).first()
        ongoing.append(SessionInfo(
            session_id=s.session_id,
            student_name=student.name if student else "Unknown",
            start_time=s.start_time,
            risk_score=s.risk_score or 0,
        ))

    submitted = []
    for s in submitted_sessions:
        student = db.query(User).filter(User.id == s.student_id).first()
        sub = db.query(SubmittedExam).filter(SubmittedExam.session_id == s.session_id).first()
        submitted.append(SessionInfo(
            session_id=s.session_id,
            student_name=student.name if student else "Unknown",
            start_time=s.start_time,
            risk_score=s.risk_score or 0,
            score=sub.score if sub else None,
            report_link=f"/reports/{s.session_id}_report.pdf",
        ))

    return AdminDashboardResponse(ongoing=ongoing, submitted=submitted)


@router.get("/admin/student_summary", response_model=StudentSummary)
def student_summary(session_id: int = Query(...), db: Session = Depends(get_db), admin: User = Depends(get_admin_from_token)):
    session = db.query(ExamSession).filter(ExamSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    student = db.query(User).filter(User.id == session.student_id).first()
    violations = db.query(Violation).filter(Violation.session_id == session_id).all()
    logs = db.query(ActivityLog).filter(ActivityLog.session_id == session_id).order_by(ActivityLog.timestamp).all()
    sub = db.query(SubmittedExam).filter(SubmittedExam.session_id == session_id).first()

    with open(VT_PATH) as f:
        vt = json.load(f)

    vio_list = []
    for v in violations:
        vtype = vt.get(v.v_type_id, {})
        vio_list.append({
            "violation_id": v.violation_id,
            "v_type_id": v.v_type_id,
            "name": vtype.get("name", v.v_type_id),
            "risk_weight": vtype.get("risk_weight", 0),
            "timestamp": v.timestamp.isoformat() if v.timestamp else None,
        })

    log_entries = [ActivityLogEntry(
        log_id=log.log_id,
        session_id=log.session_id,
        activity=log.activity,
        timestamp=log.timestamp,
    ) for log in logs]

    return StudentSummary(
        session_id=session.session_id,
        student_name=student.name if student else "Unknown",
        student_email=student.email if student else "Unknown",
        start_time=session.start_time,
        end_time=session.end_time,
        status=session.status.value,
        risk_score=session.risk_score or 0,
        score=sub.score if sub else None,
        violations=vio_list,
        activity_logs=log_entries,
    )
