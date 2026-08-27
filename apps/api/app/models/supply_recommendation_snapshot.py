from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text, Float
from sqlalchemy.sql import func

from app.db import Base


class SupplyRecommendationSnapshot(Base):
    __tablename__ = "supply_recommendation_snapshot"

    id = Column(String(36), primary_key=True)
    batch_id = Column(String(36), nullable=False, index=True)
    selected_list_id = Column(String(36), ForeignKey("dataset.id"), nullable=False, index=True)
    word = Column(Text, nullable=False)
    normalized_word = Column(String(512), nullable=False, index=True)
    rank = Column(Integer, nullable=False)
    supply_score = Column(Float, nullable=False)
    score_breakdown_json = Column(Text, nullable=False, default="{}")
    why_selected_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_supply_recommendation_list_batch_rank", "selected_list_id", "batch_id", "rank"),
    )

