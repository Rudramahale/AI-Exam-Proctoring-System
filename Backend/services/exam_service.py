from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException

from db.models import ExamSession, ActivityLog, SessionStatus, SubmittedExam


def start_exam(db: Session, student_id: int, student_photo: str = None) -> dict:
    session = ExamSession(
        student_id=student_id,
        status=SessionStatus.ongoing,
        start_time=datetime.utcnow(),
        student_photo=student_photo,
    )
    db.add(session)
    db.flush()

    log = ActivityLog(session_id=session.session_id, activity="Exam started")
    db.add(log)
    db.commit()
    db.refresh(session)
    return {"session_id": session.session_id, "start_time": session.start_time}


def end_exam(db: Session, session_id: int, student_id: int, answers: dict = None, score: float = None) -> dict:
    session = db.query(ExamSession).filter(
        ExamSession.session_id == session_id,
        ExamSession.student_id == student_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    if session.status == SessionStatus.submitted:
        raise HTTPException(status_code=400, detail="Exam already submitted")

    session.status = SessionStatus.submitted
    session.end_time = datetime.utcnow()
    db.flush()

    sub = SubmittedExam(
        session_id=session_id,
        student_id=student_id,
        answers=answers,
        score=score,
    )
    db.add(sub)

    log = ActivityLog(session_id=session_id, activity="Exam ended")
    db.add(log)
    db.commit()
    db.refresh(sub)
    return {"sub_id": sub.sub_id}
