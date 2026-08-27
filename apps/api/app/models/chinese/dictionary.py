from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class ChineseDictionary(Base):
    """字典：中文标注的数据集命名空间（对标英文 Dataset）。"""

    __tablename__ = "chinese_dictionaries"

    id = Column(String(36), primary_key=True)
    name = Column(String(256), nullable=False)
    owner = Column(String(64), nullable=False, server_default="default", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sessions = relationship(
        "ChineseAnnotationSession",
        back_populates="dictionary",
    )
