from database.connection import Base, engine
from models.students import Student
from models.Exam import Exam
from models.Facevarification import FaceVerification
from models.Violation import Violation
from models.Screenshot import Screenshot
from models.Exam_session import ExamSession
from models.Report import Report
from models.Activity_log import ActivityLog
from models.user_model import User
from models.Risk_score import RiskScore
from models.Exam_session import ExamSession


Base.metadata.create_all(bind = engine)
print("Table created successfully in database")
