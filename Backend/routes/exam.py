import logging
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Header, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from jose import JWTError
from sqlalchemy.exc import OperationalError

from db.database import get_db, SessionLocal
from db.models import ExamSession, SessionStatus
from db.schemas import StartExamRequest, StartExamResponse, EndExamRequest, EndExamResponse
from services.exam_service import start_exam, end_exam
from services.auth_service import get_current_user
from services.report_service import generate_report
from services.violation_service import report_violation
from utils.jwt_utils import decode_access_token
from utils.presence_of_person import detect_faces

import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

router = APIRouter()
FRAMES_DIR = Path(__file__).parent.parent / "frames"
FRAMES_DIR.mkdir(exist_ok=True)

# Dedicated thread pool for CPU-bound face detection so it never blocks the event loop
_DETECTOR_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="face_det")

# ── Per-session violation cooldowns ─────────────────────────────────────────
# Key: (session_id, vio_type_id)  →  Value: last_fired epoch (float)
# Prevents the same violation from spamming on consecutive 3-second frames.
_last_fired: dict[tuple, float] = defaultdict(float)

# How many seconds must pass before the same violation type fires again per session
COOLDOWN_SECONDS: dict[str, float] = {
    "VIO_001": 10,   # no face          — can re-fire after 10 s
    "VIO_002": 10,   # multiple faces   — can re-fire after 10 s
    "VIO_004": 8,    # head movement    — 8 s between re-fires (was 20 s, user felt delay)
    "VIO_006": 15,   # camera blocked   — can re-fire after 15 s
}
DEFAULT_COOLDOWN = 10   # fallback for any violation not listed above

# ── Temporal face-presence tracking ─────────────────────────────────────────
# Key: session_id  →  Value: last time (monotonic) a face was detected.
# Used to distinguish "head turned away" (face disappeared abruptly) from
# "genuinely no face" (user walked away, never had a face, etc.).
_last_face_seen: dict[int, float] = defaultdict(float)
HEAD_TURN_AWAY_SECONDS = 30   # if face was seen within this window, a
                              # sudden face_count=0 means head turned away
                              # → fire VIO_004 instead of VIO_001.

# ── Per-session brightness tracking ──────────────────────────────────────────
# Stores the grayscale mean at the time a face was last visible.
# Used to detect camera-block transitions: if brightness drops sharply
# from one frame to the next while the face disappears, it's likely a
# camera slider / finger covering the lens — NOT a head turn.
_last_face_brightness: dict[int, float] = defaultdict(float)
BRIGHTNESS_DROP_THRESHOLD = 30   # if brightness drops this much → blocked
DIM_BRIGHTNESS_THRESHOLD  = 80   # if brightness below this → blocked


def _cooldown_ok(session_id: int, vio_type_id: str) -> bool:
    """Return True if enough time has passed to fire this violation again."""
    key = (session_id, vio_type_id)
    gap = COOLDOWN_SECONDS.get(vio_type_id, DEFAULT_COOLDOWN)
    return (time.monotonic() - _last_fired[key]) >= gap


def _mark_fired(session_id: int, vio_type_id: str) -> None:
    _last_fired[(session_id, vio_type_id)] = time.monotonic()


def get_email_from_token(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token header")
    token = authorization.split(" ", 1)[1]
    try:
        return decode_access_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/start_exam", response_model=StartExamResponse)
def start(payload: StartExamRequest, db: Session = Depends(get_db), email: str = Depends(get_email_from_token)):
    user = get_current_user(db, email)
    result = start_exam(db, user.id, payload.student_photo)
    return StartExamResponse(**result)


@router.post("/end_exam", response_model=EndExamResponse)
def end(request: Request, payload: EndExamRequest, db: Session = Depends(get_db), email: str = Depends(get_email_from_token)):
    # Use cached violation types — no disk I/O
    vt = request.app.state.violation_types
    try:
        user = get_current_user(db, email)
        end_exam(db, payload.session_id, user.id, payload.answers, payload.score)
        report_result = generate_report(db, payload.session_id, vt)
        return EndExamResponse(message="Exam submitted", report_id=report_result["report_id"])
    except OperationalError:
        db.rollback()
        db.close()
        db2 = SessionLocal()
        try:
            user = get_current_user(db2, email)
            end_exam(db2, payload.session_id, user.id, payload.answers, payload.score)
            report_result = generate_report(db2, payload.session_id, vt)
            return EndExamResponse(message="Exam submitted (retry)", report_id=report_result["report_id"])
        finally:
            db2.close()


@router.post("/monitor-frame")
async def monitor_frame(
    request: Request,
    session_id: int = Form(...),
    photo: UploadFile = File(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_email_from_token),
):
    user = get_current_user(db, email)
    session = db.query(ExamSession).filter(ExamSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    if session.status != SessionStatus.ongoing:
        raise HTTPException(status_code=400, detail="Exam session is not ongoing")

    result = {"message": "Frame received", "session_id": session_id}

    if photo and photo.filename:
        try:
            image_bytes = await photo.read()

            # Run CPU-bound face detection in thread pool — does NOT block the event loop
            detection = await asyncio.get_running_loop().run_in_executor(_DETECTOR_POOL, detect_faces, image_bytes)

            face_count    = detection["face_count"]
            cam_blocked   = detection.get("camera_blocked", False)
            result["face_count"] = face_count

            if detection["yaw"] is not None:
                result["pose"] = {
                    "yaw":   round(detection["yaw"],   1),
                    "pitch": round(detection["pitch"], 1),
                    "roll":  round(detection["roll"],  1),
                }

            # Use cached violation types — no disk I/O per frame
            vt = request.app.state.violation_types
            timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
            violations_fired = []

            # ── VIO_006 — Camera Blocked ─────────────────────────────────────
            # Check FIRST: if the feed is dead / covered, skip face-count logic
            if cam_blocked:
                result["detection"] = "camera_blocked"
                if _cooldown_ok(session_id, "VIO_006"):
                    _mark_fired(session_id, "VIO_006")
                    frame_path = str(FRAMES_DIR / f"session_{session_id}_{timestamp}_vio006.jpg")
                    with open(frame_path, "wb") as f:
                        f.write(image_bytes)
                    vio = report_violation(db, session_id, "VIO_006", image_path=frame_path, violation_types=vt)
                    violations_fired.append(vio["warning"])
                    logger.info("VIO_006 fired  session=%s", session_id)
                else:
                    logger.debug("VIO_006 suppressed (cooldown)  session=%s", session_id)

            # ── Face-count violations ────────────────────────────────────────
            elif face_count == 0:
                brightness = detection.get("brightness", 255.0)
                uniformity = detection.get("uniformity", 255.0)
                last_seen = _last_face_seen[session_id]
                recently_had_face = last_seen > 0 and (time.monotonic() - last_seen) < HEAD_TURN_AWAY_SECONDS

                if recently_had_face:
                    # Check if this is a CAMERA BLOCK TRANSITION rather than a head turn.
                    # A camera slider / finger covering the lens makes the frame
                    # darker than when the face was visible; a head turn does not.
                    last_brightness = _last_face_brightness[session_id]
                    brightness_dropped = last_brightness > 0 and (last_brightness - brightness) > BRIGHTNESS_DROP_THRESHOLD
                    image_is_dim = brightness < DIM_BRIGHTNESS_THRESHOLD

                    if brightness_dropped or image_is_dim:
                        # Camera is being physically blocked — fire VIO_006
                        if _cooldown_ok(session_id, "VIO_006"):
                            _mark_fired(session_id, "VIO_006")
                            result["detection"] = "camera_blocked_transition"
                            logger.info(
                                "VIO_006 fired (transition)  session=%s  brightness=%.1f->%.1f",
                                session_id, last_brightness, brightness,
                            )
                            frame_path = str(FRAMES_DIR / f"session_{session_id}_{timestamp}_vio006.jpg")
                            with open(frame_path, "wb") as f:
                                f.write(image_bytes)
                            vio = report_violation(db, session_id, "VIO_006", image_path=frame_path, violation_types=vt)
                            violations_fired.append(vio["warning"])
                    elif _cooldown_ok(session_id, "VIO_004"):
                        # Head turn — brightness held steady but face disappeared
                        _mark_fired(session_id, "VIO_004")
                        result["detection"] = "suspicious_head_movement"
                        logger.info(
                            "VIO_004 fired (face disappeared)  session=%s  last_seen=%.1fs ago  brightness=%.1f",
                            session_id, time.monotonic() - last_seen, brightness,
                        )
                        frame_path = str(FRAMES_DIR / f"session_{session_id}_{timestamp}_vio004.jpg")
                        with open(frame_path, "wb") as f:
                            f.write(image_bytes)
                        vio = report_violation(db, session_id, "VIO_004", image_path=frame_path, violation_types=vt)
                        violations_fired.append(vio["warning"])
                    else:
                        result["detection"] = "no_face"
                elif _cooldown_ok(session_id, "VIO_001"):
                    result["detection"] = "no_face"
                    _mark_fired(session_id, "VIO_001")
                    frame_path = str(FRAMES_DIR / f"session_{session_id}_{timestamp}_vio001.jpg")
                    with open(frame_path, "wb") as f:
                        f.write(image_bytes)
                    vio = report_violation(db, session_id, "VIO_001", image_path=frame_path, violation_types=vt)
                    violations_fired.append(vio["warning"])
                else:
                    result["detection"] = "no_face"

            elif face_count > 1:
                _last_face_seen[session_id] = time.monotonic()   # still saw a face
                _last_face_brightness[session_id] = detection.get("brightness", 255.0)
                result["detection"] = "multiple_faces"
                if _cooldown_ok(session_id, "VIO_002"):
                    _mark_fired(session_id, "VIO_002")
                    frame_path = str(FRAMES_DIR / f"session_{session_id}_{timestamp}_vio002.jpg")
                    with open(frame_path, "wb") as f:
                        f.write(image_bytes)
                    vio = report_violation(db, session_id, "VIO_002", image_path=frame_path, violation_types=vt)
                    violations_fired.append(vio["warning"])

            else:
                _last_face_seen[session_id] = time.monotonic()
                _last_face_brightness[session_id] = detection.get("brightness", 255.0)
                result["detection"] = "face_detected"

                # ── VIO_004 — Suspicious Head Movement ──────────────────────
                # Only fires when: thresholds exceeded AND cooldown has elapsed.
                # Cooldown = 20 s, so a sustained look-away fires at most ~3×/min.
                if detection["suspicious_head_movement"]:
                    if _cooldown_ok(session_id, "VIO_004"):
                        _mark_fired(session_id, "VIO_004")
                        logger.info(
                            "VIO_004 fired  session=%s  yaw=%.1f  pitch=%.1f",
                            session_id,
                            detection["yaw"],
                            detection["pitch"],
                        )
                        result["detection"] = "suspicious_head_movement"
                        frame_path = str(FRAMES_DIR / f"session_{session_id}_{timestamp}_vio004.jpg")
                        with open(frame_path, "wb") as f:
                            f.write(image_bytes)
                        vio = report_violation(db, session_id, "VIO_004", image_path=frame_path, violation_types=vt)
                        violations_fired.append(vio["warning"])
                    else:
                        logger.debug(
                            "VIO_004 suppressed (cooldown)  session=%s  yaw=%.1f  pitch=%.1f",
                            session_id,
                            detection["yaw"],
                            detection["pitch"],
                        )

            if violations_fired:
                result["violations"] = violations_fired

        except Exception as e:
            logger.exception("Frame processing error for session %s", session_id)
            result["frame_error"] = str(e)

    return result
