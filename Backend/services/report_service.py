import os
from fastapi import HTTPException
from sqlalchemy.orm import Session

from db.models import User, ExamSession, Violation, ActivityLog, SubmittedExam, Report
from utils.pdf_utils import generate_pdf_report


def generate_report(db: Session, session_id: int, violation_types: dict) -> dict:
    session = db.query(ExamSession).filter(ExamSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    student = db.query(User).filter(User.id == session.student_id).first()

    violations = db.query(Violation).filter(Violation.session_id == session_id).all()
    logs = db.query(ActivityLog).filter(ActivityLog.session_id == session_id).order_by(ActivityLog.timestamp).all()
    submitted = db.query(SubmittedExam).filter(SubmittedExam.session_id == session_id).first()

    vio_list = []
    for v in violations:
        vtype = violation_types.get(v.v_type_id, {})
        vio_list.append({
            "timestamp": v.timestamp.isoformat() if v.timestamp else "",
            "name": vtype.get("name", v.v_type_id),
            "risk_weight": vtype.get("risk_weight", 0),
        })

    log_list = []
    for log in logs:
        log_list.append({
            "timestamp": log.timestamp.isoformat() if log.timestamp else "",
            "activity": log.activity,
        })

    session_data = {
        "session_id": session_id,
        "student_name": student.name if student else "N/A",
        "student_id": student.id if student else "N/A",
        "email": student.email if student else "N/A",
        "start_time": session.start_time.isoformat() if session.start_time else "N/A",
        "end_time": session.end_time.isoformat() if session.end_time else "N/A",
        "score": submitted.score if submitted else "N/A",
        "risk_score": session.risk_score or 0,
        "violations": vio_list,
        "activity_logs": log_list,
    }

    pdf_path = generate_pdf_report(session_data)

    report = Report(
        student_id=session.student_id,
        session_id=session_id,
        pdf_path=pdf_path,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"report_id": report.report_id, "pdf_path": pdf_path}
