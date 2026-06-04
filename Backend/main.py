import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from db.database import Base, engine
from routes import auth, exam, violation, admin, report

app = FastAPI(title="AI Exam Proctoring System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    vt_path = Path(__file__).parent / "violation_types.json"
    with open(vt_path) as f:
        app.state.violation_types = json.load(f)


app.include_router(auth.router)
app.include_router(exam.router)
app.include_router(violation.router)
app.include_router(admin.router)
app.include_router(report.router)

reports_dir = Path(__file__).parent / "reports"
reports_dir.mkdir(exist_ok=True)
app.mount("/reports", StaticFiles(directory=str(reports_dir)), name="reports")
