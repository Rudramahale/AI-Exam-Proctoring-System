"""
Face detection + head pose estimation + camera-blocked detection.

Head pose (VIO_004) — landmark geometry approach:
  Uses the 2-D positions of nose tip, eye outer corners, chin, and forehead
  to compute normalised yaw/pitch ratios.  This avoids the Euler-angle
  decomposition of the facial_transformation_matrix, whose coordinate-system
  conventions can shift the "neutral forward" value away from zero and cause
  permanent false positives.

  Yaw  ratio = (nose_x − eye_midpoint_x) / face_width
               ≈ 0 when frontal, ≈ ±0.25+ when turned ~35°
  Pitch ratio = (nose_y − face_vert_center_y) / face_height
               ≈ 0 when level,   ≈ ±0.15+ when tilted ~30°

  If MediaPipe is not installed, VIO_004 is silently disabled (no false
  positives, see previous bug where Haar+solvePnP gave yaw≈±177° always).

Camera-blocked (VIO_006):
  Brightness + uniformity check on the grayscale frame before anything else.
"""

import os

# Suppress MediaPipe / TF Lite / glog / abseil startup noise
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")    # ERROR only
os.environ.setdefault("GLOG_minloglevel", "3")        # ERROR only
os.environ.setdefault("ABSL_MIN_LOG_LEVEL", "3")      # ERROR only

import cv2
import numpy as np
import logging

logger = logging.getLogger(__name__)

# ── Head-pose thresholds (landmark-ratio units) ──────────────────────────────
# Frontal resting value ≈ 0.  Tuned so normal reading / slight tilts don't fire.
YAW_RATIO_THRESHOLD   = 0.22   # 0 = frontal, ~0.22 ≈ 35° turn
PITCH_RATIO_THRESHOLD = 0.15   # 0 = level,   ~0.15 ≈ 30° tilt

# ── Camera-blocked detection ─────────────────────────────────────────────────
# THREE-LEVEL CHECK:
#   1. Strict (early exit)  : mean < MEAN_STRICT AND std < STD_STRICT
#      → definitely blocked (lens cap, hand fully covering, camera-facing-desk)
#   2. Post-detection #1    : face_count == 0 AND mean < MEAN_SOFT AND std < STD_SOFT
#      → probably blocked   (finger-on-lens with light leakage, partial cover)
#   3. Post-detection #2    : face_count == 0 AND Laplacian variance < BLUR_THRESHOLD
#      → camera is blurred / featureless  — even if mean+std look "normal"
MEAN_STRICT = 60    # out of 255
STD_STRICT  = 30    # out of 255
MEAN_SOFT   = 80    # out of 255
STD_SOFT    = 40    # out of 255
# Laplacian variance: a completely smooth / blocked frame has near-zero edges.
# Normal frame (even a clean wall) has some texture / noise.
# Combined OR logic: no face AND (dark+uniform OR blurry) → camera blocked
BLUR_THRESHOLD = 30

# ── Haar cascade (always available) ─────────────────────────────────────────
_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
if _FACE_CASCADE.empty():
    raise RuntimeError("haarcascade_frontalface_default.xml not found")

# ── MediaPipe FaceLandmarker ─────────────────────────────────────────────────
_MP_LANDMARKER   = None
_MP_IMAGE_CLS    = None
_MEDIAPIPE_READY = False


def _try_init_mediapipe():
    global _MP_LANDMARKER, _MP_IMAGE_CLS, _MEDIAPIPE_READY
    import urllib.request, pathlib
    try:
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision
        import mediapipe as mp

        model_dir  = pathlib.Path(__file__).parent.parent / ".mediapipe_models"
        model_dir.mkdir(exist_ok=True)
        model_path = model_dir / "face_landmarker.task"

        if not model_path.exists():
            url = (
                "https://storage.googleapis.com/mediapipe-models/"
                "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
            )
            logger.info("Downloading MediaPipe FaceLandmarker model ...")
            urllib.request.urlretrieve(url, model_path)
            logger.info("Download complete: %s", model_path)

        base_opts = mp_tasks.BaseOptions(model_asset_path=str(model_path))
        opts = vision.FaceLandmarkerOptions(
            base_options=base_opts,
            running_mode=vision.RunningMode.IMAGE,
            num_faces=2,
            min_face_detection_confidence=0.5,
            output_facial_transformation_matrixes=False,
        )
        _MP_LANDMARKER   = vision.FaceLandmarker.create_from_options(opts)
        _MP_IMAGE_CLS    = mp.Image
        _MEDIAPIPE_READY = True
        logger.info("MediaPipe FaceLandmarker ready — VIO_004 active.")
    except Exception:
        logger.warning(
            "MediaPipe unavailable — VIO_004 (head-pose) disabled. "
            "Run: uv add mediapipe",
            exc_info=False,
        )


_try_init_mediapipe()


# ── Landmark indices (MediaPipe 478-point model) ─────────────────────────────
_LM_NOSE      = 4    # nose tip
_LM_L_EYE    = 263  # left  eye outer corner (person's left, image right)
_LM_R_EYE    = 33   # right eye outer corner (person's right, image left)
_LM_CHIN     = 152  # chin centre
_LM_FOREHEAD = 10   # top of forehead


def _estimate_pose_from_landmarks(landmarks):
    """
    Compute normalised yaw and pitch metrics from 2-D landmark positions.

    Returns (yaw_ratio, pitch_ratio) – both None if landmarks are unusable.
    """
    try:
        nose  = landmarks[_LM_NOSE]
        l_eye = landmarks[_LM_L_EYE]
        r_eye = landmarks[_LM_R_EYE]
        chin  = landmarks[_LM_CHIN]
        top   = landmarks[_LM_FOREHEAD]

        face_width = abs(l_eye.x - r_eye.x)
        if face_width < 0.02:          # face too small / partially off-screen
            return None, None

        eye_mid_x = (l_eye.x + r_eye.x) / 2
        yaw_ratio = (nose.x - eye_mid_x) / face_width  # + = turned right

        face_height = abs(chin.y - top.y)
        if face_height < 0.02:
            return yaw_ratio, None

        v_mid       = (chin.y + top.y) / 2
        pitch_ratio = (nose.y - v_mid) / face_height   # + = tilted down

        return yaw_ratio, pitch_ratio
    except (IndexError, AttributeError):
        return None, None


def _pose_from_mediapipe(bgr_image):
    """
    Run MediaPipe FaceLandmarker; return (face_count, yaw_ratio, pitch_ratio).
    Returns None if MediaPipe is unavailable.
    """
    if not _MEDIAPIPE_READY:
        return None
    try:
        rgb    = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)
        mp_img = _MP_IMAGE_CLS(image_format=0, data=rgb)
        result = _MP_LANDMARKER.detect(mp_img)
        face_count = len(result.face_landmarks)
        if face_count == 0:
            return face_count, None, None
        yaw_ratio, pitch_ratio = _estimate_pose_from_landmarks(result.face_landmarks[0])
        return face_count, yaw_ratio, pitch_ratio
    except Exception:
        logger.debug("MediaPipe detection failed", exc_info=True)
        return None


def detect_faces(image) -> dict:
    """
    Accepts raw JPEG bytes or an OpenCV BGR ndarray.

    Returns:
        {
            "face_count": int,
            "yaw":   float | None,   # yaw_ratio × 100 (pseudo-degree for logging)
            "pitch": float | None,   # pitch_ratio × 100
            "roll":  None,
            "suspicious_head_movement": bool,
            "camera_blocked": bool,
        }
    """
    # ── Decode ──────────────────────────────────────────────────────────────
    if isinstance(image, bytes):
        nparr = np.frombuffer(image, np.uint8)
        bgr   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if bgr is None:
            return _empty_result(0, camera_blocked=True)
    elif hasattr(image, "shape"):
        bgr = image
    else:
        return _empty_result(0, camera_blocked=True)

    # ── Image statistics (used by both blocked checks) ──────────────────────
    gray       = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    uniformity = float(np.std(gray))

    # ── Level 1 — Strict camera-blocked check (early exit) ─────────────────
    # Catches lens cap, hand fully covering, camera-facing-desk, etc.
    if brightness < MEAN_STRICT and uniformity < STD_STRICT:
        logger.debug("Camera blocked (strict): mean=%.1f std=%.1f", brightness, uniformity)
        return _empty_result(0, camera_blocked=True, brightness=brightness, uniformity=uniformity)

    # ── MediaPipe path ───────────────────────────────────────────────────────
    mp_result = _pose_from_mediapipe(bgr)
    if mp_result is not None:
        face_count, yaw_ratio, pitch_ratio = mp_result
        suspicious = _is_suspicious(yaw_ratio, pitch_ratio)

        # Level 2 — Post-detection blocked checks (only when no face found)
        # OR logic: EITHER dark+uniform OR extremely blurry → blocked.
        # This catches lens cap, hand, finger, cloth — any physical cover.
        if face_count == 0:
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            if (brightness < MEAN_SOFT and uniformity < STD_SOFT) or laplacian_var < BLUR_THRESHOLD:
                logger.info(
                    "Camera blocked (post): mean=%.1f std=%.1f laplacian=%.1f",
                    brightness, uniformity, laplacian_var,
                )
                return _empty_result(0, camera_blocked=True, brightness=brightness, uniformity=uniformity)

        # Scale ratios ×100 for readable log values (roughly ~degree-range numbers)
        return {
            "face_count": face_count,
            "yaw":   round(yaw_ratio   * 100, 1) if yaw_ratio   is not None else None,
            "pitch": round(pitch_ratio * 100, 1) if pitch_ratio is not None else None,
            "roll":  None,
            "suspicious_head_movement": suspicious,
            "camera_blocked": False,
            "brightness": round(brightness, 1),
            "uniformity": round(uniformity, 1),
        }

    # ── Haar-cascade fallback (face COUNT only, no pose) ────────────────────
    # solvePnP with bounding-box landmark estimates gives yaw ≈ ±177° for
    # a perfectly frontal face (180° PnP ambiguity). VIO_004 is disabled
    # in this path to prevent constant false positives.
    faces = _FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
    )
    face_count = int(len(faces))

    # Level 2 — Post-detection blocked checks for Haar path too
    if face_count == 0:
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if (brightness < MEAN_SOFT and uniformity < STD_SOFT) or laplacian_var < BLUR_THRESHOLD:
            logger.info(
                "Camera blocked (post, Haar): mean=%.1f std=%.1f laplacian=%.1f",
                brightness, uniformity, laplacian_var,
            )
            return _empty_result(0, camera_blocked=True, brightness=brightness, uniformity=uniformity)

    return {
        "face_count": face_count,
        "yaw":   None,
        "pitch": None,
        "roll":  None,
        "suspicious_head_movement": False,
        "camera_blocked": False,
        "brightness": round(brightness, 1),
        "uniformity": round(uniformity, 1),
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_suspicious(yaw_ratio, pitch_ratio) -> bool:
    if yaw_ratio is None and pitch_ratio is None:
        return False
    yaw_sus   = abs(yaw_ratio)   > YAW_RATIO_THRESHOLD   if yaw_ratio   is not None else False
    pitch_sus = abs(pitch_ratio) > PITCH_RATIO_THRESHOLD if pitch_ratio is not None else False
    return yaw_sus or pitch_sus


def _empty_result(face_count: int, *, camera_blocked: bool = False,
                  brightness: float = 0.0, uniformity: float = 0.0) -> dict:
    return {
        "face_count": face_count,
        "yaw":   None,
        "pitch": None,
        "roll":  None,
        "suspicious_head_movement": False,
        "camera_blocked": camera_blocked,
        "brightness": round(brightness, 1),
        "uniformity": round(uniformity, 1),
    }
