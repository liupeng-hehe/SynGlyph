from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func

from app.db import Base


class WordPronunciationCache(Base):
    __tablename__ = "word_pronunciation_cache"

    id = Column(String(36), primary_key=True)
    normalized_word = Column(String(256), nullable=False, index=True)
    preprocessing_version = Column(String(64), nullable=False)
    cache_json = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
