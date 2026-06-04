from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import Optional, Any


class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "student"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int = 0
    role: str = ""


class SignupResponse(BaseModel):
    message: str
    user_id: int
    access_token: str
    token_type: str = "bearer"


class StartExamRequest(BaseModel):
    student_photo: Optional[str] = None


class StartExamResponse(BaseModel):
    session_id: int
    start_time: datetime


class EndExamRequest(BaseModel):
    session_id: int
    answers: Optional[dict[str, Any]] = None
    score: Optional[float] = None


class EndExamResponse(BaseModel):
    message: str
    report_id: int


class ViolationReport(BaseModel):
    session_id: int
    v_type_id: str
    image_path: Optional[str] = None


class ActivityLogEntry(BaseModel):
    log_id: int
    session_id: int
    activity: str
    timestamp: datetime


class StudentSummary(BaseModel):
    session_id: int
    student_name: str
    student_email: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: str
    risk_score: float
    score: Optional[float] = None
    violations: list[dict] = []
    activity_logs: list[ActivityLogEntry] = []


class SessionInfo(BaseModel):
    session_id: int
    student_name: str
    start_time: Optional[datetime] = None
    risk_score: float
    score: Optional[float] = None
    report_link: Optional[str] = None


class AdminDashboardResponse(BaseModel):
    ongoing: list[SessionInfo] = []
    submitted: list[SessionInfo] = []


class ReportRequest(BaseModel):
    session_id: int


class ReportResponse(BaseModel):
    report_id: int
    pdf_path: str
