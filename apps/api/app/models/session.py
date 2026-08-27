from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class Session(Base):
    __tablename__ = "session"

    id = Column(String(36), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    annotations = relationship("Annotation", back_populates="session")
