"""
dummydata.py
------------
Seed script for the AI-Exam-Proctoring-System.

Run from the project root (same level as Backend/):
    python dummydata.py

This inserts two User entries into the database:
  1. A student account  (role = "student")
  2. An admin account   (role = "admin")

Passwords are hashed with bcrypt via passlib – identical to the
hashing used throughout the rest of the FastAPI application.

Prerequisites:
  - The database must already exist and all tables must be created
    (i.e. `Base.metadata.create_all(bind=engine)` has been called at
    least once, which happens automatically when the FastAPI app starts).
  - Environment / DB connection must be reachable (see Backend/database.py).
"""

import sys
import os

# ---------------------------------------------------------------------------
# Make sure Python can find the Backend package regardless of where the
# script is executed from.
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "Backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ---------------------------------------------------------------------------
# Imports from the Backend package
# ---------------------------------------------------------------------------
from database.connection import SessionLocal, Base, engine  # SQLAlchemy session factory & engine
from models.user_model import User              # SQLAlchemy ORM model
from models.Admin import Admin
import bcrypt
from datetime import datetime

# ---------------------------------------------------------------------------
# Password hashing – must match the scheme used in the app's auth logic
# ---------------------------------------------------------------------------

def get_password_hash(plain_password: str) -> str:
    """Return the bcrypt hash of a plain-text password."""
    return bcrypt.hashpw(plain_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


# ---------------------------------------------------------------------------
# Dummy user definitions
# ---------------------------------------------------------------------------
DUMMY_USERS = [
    {
        "username": "student_demo",
        "email": "student@example.com",
        "full_name": "Demo Student",
        "hashed_password": get_password_hash("Student@123"),
        "role": "student",
        "is_active": True,
    },
    {
        "username": "admin_demo",
        "email": "admin@example.com",
        "full_name": "Demo Admin",
        "hashed_password": get_password_hash("Admin@123"),
        "role": "admin",
        "is_active": True,
    },
]


def seed_users() -> None:
    """
    Insert dummy users into the database.

    Skips a user if a record with the same username already exists,
    so the script is safe to run multiple times.
    """
    # Ensure all tables exist before seeding
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        inserted = 0
        skipped = 0

        for user_data in DUMMY_USERS:
            existing = (
                db.query(User)
                .filter(User.email == user_data["email"])
                .first()
            )
            if existing:
                print(
                    f"[SKIP]   User '{user_data['username']}' already exists "
                    f"(role={existing.role})."
                )
                skipped += 1
                continue

            user_payload = {
                "name": user_data["full_name"],
                "email": user_data["email"],
                "hashed_password": user_data["hashed_password"],
                "role": user_data["role"],
                "is_active": int(user_data["is_active"]),
                "created_at": datetime.utcnow().isoformat(),
            }

            new_user = User(**user_payload)
            db.add(new_user)
            inserted += 1
            print(
                f"[INSERT] User '{user_data['username']}' "
                f"(role={user_data['role']}) added."
            )

            if user_data["role"] == "admin":
                existing_admin = (
                    db.query(Admin)
                    .filter(Admin.username == user_data["username"])
                    .first()
                )
                if not existing_admin:
                    new_admin = Admin(
                        username=user_data["username"],
                        password=user_data["hashed_password"],
                    )
                    db.add(new_admin)
                    print(
                        f"[INSERT] Admin '{user_data['username']}' added to admins table."
                    )
                else:
                    print(
                        f"[SKIP]   Admin '{user_data['username']}' already exists in admins table."
                    )

        db.commit()
        print(
            f"\nDone. {inserted} user(s) inserted, {skipped} user(s) skipped."
        )

    except Exception as exc:
        db.rollback()
        print(f"\n[ERROR] Transaction rolled back: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 55)
    print("  AI-Exam-Proctoring-System – Seed Dummy Users")
    print("=" * 55)
    seed_users()

