from pydantic import BaseModel

class ViolationCreate(BaseModel):
    session_id: int
    violation_type: str
    