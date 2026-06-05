"""Integration test using FastAPI TestClient. Run: python test_integration.py"""
import sys, io, base64, json
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))
import config  # loads .env
from main import app

# Manually trigger the startup event to load violation_types into app.state
import json
app.state.violation_types = json.loads(
    (Path(__file__).parent / "violation_types.json").read_text()
)

client = TestClient(app)

# 1. Sign up / Login
print("=== Auth Flow ===")
r = client.post("/login", json={"email": "testuser@test.com", "password": "test123"})
if r.status_code == 200:
    token = r.json()["access_token"]
    print(f"Login OK: user_id={r.json().get('user_id')}")
else:
    r = client.post("/sign_up", json={"name": "Test User", "email": "testuser@test.com", "password": "test123", "role": "student"})
    assert r.status_code == 200, f"Signup failed: {r.text}"
    token = r.json()["access_token"]
    print(f"Signup OK: user_id={r.json().get('user_id')}")

headers = {"Authorization": f"Bearer {token}"}

# 2. Start exam
print("\n=== Start Exam ===")
tiny_jpeg = ("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS"
              "Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQw"
              "LDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy"
              "MjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAA"
              "AAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJx"
              "FDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVW"
              "V1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2"
              "t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEB"
              "AQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEE"
              "BSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYI4Q/SFhSRFJiMkV"
              "ic4EzQjR0RSlFNkVUcCZS/2gAMAwEAAhEDEQA/ALX//Z")
photo_b64 = "data:image/jpeg;base64," + tiny_jpeg
r = client.post("/start_exam", json={"student_photo": photo_b64}, headers=headers)
assert r.status_code == 200, f"Start exam failed: {r.text}"
session_id = r.json()["session_id"]
print(f"Start exam OK: session_id={session_id}")

# 3. Monitor frame - camera blocked (all-black frame triggers VIO_006)
print("\n=== Monitor Frame (camera blocked) ===")
blank = np.zeros((480, 640, 3), dtype=np.uint8)
_, buf = cv2.imencode('.jpg', blank)
r = client.post("/monitor-frame", data={"session_id": str(session_id)}, files={"photo": ("frame.jpg", buf.tobytes(), "image/jpeg")}, headers=headers)
print(f"Monitor frame response: {r.json()}")
assert r.status_code == 200
assert r.json().get("detection") == "camera_blocked", f"Expected camera_blocked detection, got: {r.json()}"
print("Monitor frame: VIO_006 triggered OK")

# 3b. Monitor frame - no face (VIO_001) with a bright, uniform image
print("\n=== Monitor Frame (no face, bright image) ===")
bright = np.full((480, 640, 3), 128, dtype=np.uint8)  # medium gray, no face
# Add slight noise so it's not detected as blocked
bright += np.random.randint(0, 30, bright.shape, dtype=np.uint8)
bright = np.clip(bright, 0, 255).astype(np.uint8)
_, buf2 = cv2.imencode('.jpg', bright)
r = client.post("/monitor-frame", data={"session_id": str(session_id)}, files={"photo": ("frame.jpg", buf2.tobytes(), "image/jpeg")}, headers=headers)
print(f"Monitor frame response: {r.json()}")
assert r.status_code == 200
assert r.json().get("detection") == "no_face", f"Expected no_face detection, got: {r.json()}"
print("Monitor frame: VIO_001 triggered OK")

# 4. Report violations directly (matching frontend codes)
print("\n=== Report Violation (VIO_005 Tab Switch) ===")
r = client.post("/violation", json={"session_id": session_id, "v_type_id": "VIO_005", "image_path": ""}, headers=headers)
assert r.status_code == 200, f"Violation failed: {r.text}"
print(f"VIO_005 report: {r.json()}")

print("\n=== Report Violation (VIO_007 Full Screen Exit) ===")
r = client.post("/violation", json={"session_id": session_id, "v_type_id": "VIO_007", "image_path": ""}, headers=headers)
assert r.status_code == 200, f"Violation failed: {r.text}"
print(f"VIO_007 report: {r.json()}")

# 5. End exam
print("\n=== End Exam ===")
answers = {str(i): 0 for i in range(10)}
r = client.post("/end_exam", json={"session_id": session_id, "answers": answers, "score": 5}, headers=headers)
assert r.status_code == 200, f"End exam failed: {r.text}"
print(f"End exam OK: {r.json()}")

# 6. DB verification
print("\n=== DB Verification ===")
from db.database import SessionLocal
from db.models import Violation, Screenshot, ActivityLog, ExamSession
db = SessionLocal()
try:
    session = db.query(ExamSession).filter(ExamSession.session_id == session_id).first()
    assert session, "Session not found in DB"
    print(f"Session risk_score = {session.risk_score}")

    violations = db.query(Violation).filter(Violation.session_id == session_id).all()
    print(f"Violations table: {len(violations)} records")
    for v in violations:
        print(f"  [{v.violation_id}] {v.v_type_id}")

    screenshots = db.query(Screenshot).filter(Screenshot.session_id == session_id).all()
    print(f"Screenshots table: {len(screenshots)} records")
    for s in screenshots:
        print(f"  [{s.screenshot_id}] violation_id={s.violation_id} path={s.image_path}")

    logs = db.query(ActivityLog).filter(ActivityLog.session_id == session_id).all()
    print(f"Activity logs table: {len(logs)} records")
    for l in logs:
        print(f"  [{l.log_id}] {l.activity}")

finally:
    db.close()

print("\n=== ALL INTEGRATION TESTS PASSED ===")
