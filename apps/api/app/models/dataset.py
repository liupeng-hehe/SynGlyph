from sqlalchemy import Boolean, Column, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db import Base


class Dataset(Base):
    __tablename__ = "dataset"

    id = Column(String(36), primary_key=True)
    name = Column(String(256), nullable=False)
    owner = Column(String(64), nullable=True, index=True)  # annotator id: "A", "B", "admin", etc.
    # Maintainer marks one dataset as the primary project root for onboarding (optional).
    is_canonical_root = Column(Boolean, nullable=False, server_default="0")
    # e.g. manual, alphabet_init, import_bootstrap, partner_feed — free-form, optional.
    import_source = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    stimuli = relationship("Stimulus", back_populates="dataset")
