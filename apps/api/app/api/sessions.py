import uuid
import time
from fastapi import APIRouter, Depends
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Session as SessionModel
from app.schemas.session import SessionResponse

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse)
def create_session(db: Session = Depends(get_db)):
    for _ in range(3):
        try:
            sess = SessionModel(id=str(uuid.uuid4()))
            db.add(sess)
            db.commit()
            db.refresh(sess)
            return sess
        except OperationalError as e:
            db.rollback()
            if "database is locked" not in str(e).lower():
                raise
            time.sleep(0.12)
    # Let FastAPI emit 500 with original DB error context.
    sess = SessionModel(id=str(uuid.uuid4()))
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return sess
