from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.sql import func

from app.db import Base


class SupplyDemandProfile(Base):
    __tablename__ = "supply_demand_profile"

    id = Column(String(36), primary_key=True)
    selected_list_id = Column(String(36), ForeignKey("dataset.id"), nullable=False, index=True)
    profile_version = Column(String(64), nullable=False, default="pattern_supply_v1")
    pattern_gap_json = Column(Text, nullable=False, default="[]")
    context_gap_json = Column(Text, nullable=False, default="[]")
    collocation_gap_json = Column(Text, nullable=False, default="[]")
    coverage_state_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

