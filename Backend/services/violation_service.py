from fastapi import HTTPException
from sqlalchemy.orm import Session

from db.models import Violation, Screenshot, ActivityLog, ExamSession


def report_violation(
    db: Session,
    session_id: int,
    v_type_id: str,
    image_path: str = None,
    violation_types: dict = None,
) -> dict:
    if violation_types is None:
        raise HTTPException(status_code=500, detail="Violation types not loaded")

    vtype = violation_types.get(v_type_id)
    if not vtype:
        raise HTTPException(status_code=400, detail=f"Unknown violation type: {v_type_id}")

    session = db.query(ExamSession).filter(ExamSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    violation = Violation(session_id=session_id, v_type_id=v_type_id)
    db.add(violation)
    db.flush()

    if image_path:
        screenshot = Screenshot(
            session_id=session_id,
            image_path=image_path,
            violation_id=violation.violation_id,
        )
        db.add(screenshot)

    session.risk_score = (session.risk_score or 0) + vtype["risk_weight"]

    log = ActivityLog(session_id=session_id, activity=f"Violation: {v_type_id}")
    db.add(log)

    db.commit()
    db.refresh(violation)

    return {
        "warning": f"Violation detected: {vtype['name']}. Risk score updated to {session.risk_score:.1f}.",
    }
