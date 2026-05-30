from pydantic import BaseModel

class ExamCreate(BaseModel):
    title:str
    subject: str
    total_marks: int
    duration: int
    