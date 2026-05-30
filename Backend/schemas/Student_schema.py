from pydantic import BaseModel

class CreateStudent(BaseModel):
    name: str
    email: str
    password: str
    department: str
    year: str
    face_image: str = None

class StudentResponse(BaseModel):
    id: int
    name: str
    email: str
    department: str
    year: str
    face_image: str = None

    class Config:
        orm_mode = True
        