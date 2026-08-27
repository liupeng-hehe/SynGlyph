from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class EnglishAnnotationSession(Base):
    __tablename__ = "english_annotation_sessions"

    id = Column(String(36), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    word_instances = relationship(
        "EnglishWordInstance",
        back_populates="session",
        cascade="all, delete-orphan",
    )
