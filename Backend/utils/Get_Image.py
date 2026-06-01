import cv2
import numpy as np
from database.connection import SessionLocal
from models.Exam_session import ExamSession
from models.Risk_score import RiskScore

db = SessionLocal()

def get_image(session_id):
    try:
        student_record = db.query(ExamSession).filter(ExamSession.id == session_id).first()
        if not student_record:
            raise ValueError("Session not found")
        else :
            image = np.frombuffer(student_record.student_photo_data, dtype=np.uint8)
            image = cv2.imdecode(image, cv2.IMREAD_COLOR)
            return image
    except Exception as e:
        print(f"Error occurred while fetching image: {e}")
        raise