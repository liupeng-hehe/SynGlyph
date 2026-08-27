from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401 — register all ORM tables on metadata
from app.db import Base, engine, settings
from app.api.datasets import router as datasets_router
from app.api.annotations import router as annotations_router
from app.api.sessions import router as sessions_router
from app.api.stimuli import router as stimuli_router
from app.api.segment_memory import router as segment_memory_router
from app.api.import_bootstrap import router as import_bootstrap_router
from app.api.active_learning import router as active_learning_router
from app.api.letter_priors import router as letter_priors_router
from app.api.glyph_segments import router as glyph_segments_router
from app.api.glyph_graphs import router as glyph_graphs_router
from app.api.training import router as training_router
from app.api.letter_sequence_predict import router as letter_sequence_predict_router
from app.api.model_runtime import router as model_runtime_router
from app.api.english_api import router as english_product_router
from app.api.chinese_api import router as chinese_product_router
from app.api.review_feedback import router as review_feedback_router
from app.api.pattern_supply import router as pattern_supply_router
from app.api.pattern_supply_rebuild import router as pattern_supply_rebuild_router
from app.api.registry import router as registry_router
from app.api.annotation_commit import router as annotation_commit_router
from app.api.metrics import router as metrics_router
from app.api.kb_explorer import router as kb_explorer_router
from app.api.lab import router as lab_router
from app.api.colorrec import router as colorrec_router
from app.sqlite_schema import ensure_lab_profile_schema, ensure_training_tables
from app.startup_ml_checks import run_startup_ml_checks


def _parse_cors_origins(raw: str) -> list[str]:
    s = (raw or "").strip()
    if s == "*":
        return ["*"]
    parts = [p.strip() for p in s.split(",") if p.strip()]
    return parts if parts else ["*"]


app = FastAPI(title="SynGlyph API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(settings.cors_allow_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets_router)
app.include_router(annotations_router)
app.include_router(sessions_router)
app.include_router(stimuli_router)
app.include_router(segment_memory_router)
app.include_router(import_bootstrap_router)
app.include_router(active_learning_router)
app.include_router(letter_priors_router)
app.include_router(glyph_segments_router)
app.include_router(glyph_graphs_router)
app.include_router(training_router)
app.include_router(letter_sequence_predict_router)
app.include_router(model_runtime_router)
app.include_router(english_product_router)
app.include_router(chinese_product_router)
app.include_router(review_feedback_router)
app.include_router(pattern_supply_router)
app.include_router(pattern_supply_rebuild_router)
app.include_router(registry_router)
app.include_router(annotation_commit_router)
app.include_router(metrics_router)
app.include_router(kb_explorer_router)
app.include_router(lab_router)
app.include_router(colorrec_router)


@app.on_event("startup")
def on_startup():
    """Create tables on startup when using SQLite (for local dev without PostgreSQL)."""
    if "sqlite" in settings.database_url:
        Base.metadata.create_all(bind=engine)
        # create_all does not ALTER existing tables — patch training_run / model_snapshot
        ensure_training_tables(engine)
        ensure_lab_profile_schema(engine)
    run_startup_ml_checks()
