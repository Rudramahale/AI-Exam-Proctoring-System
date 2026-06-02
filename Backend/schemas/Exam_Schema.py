from pydantic import BaseModel

class ExamCreate(BaseModel):
    title:str
    subject: str
    total_marks: int
    duration: int

class EndExamRequest(BaseModel):
    session_id: int

class ExamResultResponse(BaseModel):
    message: str
    session_id: int
    start_time: str
    end_time: str