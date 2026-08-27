"""Self-heal SQLite schema for tables added after initial create_all (dev-friendly)."""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.models.model_snapshot import ModelSnapshot
from app.models.training_run import TrainingRun
from app.services.ml_deployment_dedupe import dedupe_active_ml_deployments


def ensure_training_tables(engine: Engine) -> None:
    """Add missing columns to training_run; create model_snapshot if missing.

    For SQLite dev only (also invoked from ``main`` when ``database_url`` is sqlite).
    Do **not** call this from Alembic migrations with a second pooled connection while
    ``Base.metadata.create_all`` is running — that can deadlock PostgreSQL during DDL.
    """
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    if "training_run" not in tables:
        TrainingRun.__table__.create(bind=engine, checkfirst=True)
        insp = inspect(engine)

    if "training_run" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("training_run")}
        alters: list[str] = []
        if "config_json" not in cols:
            alters.append(
                "ALTER TABLE training_run ADD COLUMN config_json TEXT NOT NULL DEFAULT '{}'"
            )
        if "out_dir" not in cols:
            alters.append(
                "ALTER TABLE training_run ADD COLUMN out_dir TEXT NOT NULL DEFAULT ''"
            )
        if "process_pid" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN process_pid INTEGER")
        if "error_message" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN error_message TEXT")
        if "started_at" not in cols:
            # SQLite ADD COLUMN cannot use CURRENT_TIMESTAMP as default (non-constant)
            alters.append("ALTER TABLE training_run ADD COLUMN started_at TIMESTAMP")
        if "updated_at" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN updated_at TIMESTAMP")
        if "finished_at" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN finished_at TIMESTAMP")
        if "best_val_loss" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN best_val_loss FLOAT")
        if "n_samples" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN n_samples INTEGER")
        if "n_unique_words" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN n_unique_words INTEGER")
        if "dataset_id" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN dataset_id VARCHAR(36)")
        if "status" not in cols:
            alters.append(
                "ALTER TABLE training_run ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'idle'"
            )
        # Legacy prototype columns — must exist if ORM maps them (INSERT sends NULLs)
        if "mode" not in cols:
            alters.append(
                "ALTER TABLE training_run ADD COLUMN mode VARCHAR(32) NOT NULL DEFAULT 'letter_sequence'"
            )
        if "checkpoint_uri" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN checkpoint_uri TEXT")
        if "message" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN message TEXT")
        if "model_version" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN model_version VARCHAR(64)")
        if "current_epoch" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN current_epoch INTEGER")

        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))

    insp = inspect(engine)
    if "model_snapshot" not in insp.get_table_names():
        ModelSnapshot.__table__.create(bind=engine, checkfirst=True)

    _ensure_phase1_ml_tables(engine)


def _ensure_phase1_ml_tables(engine: Engine) -> None:
    """Create ml_* tables and add Phase 1 columns (SQLite dev DBs without Alembic)."""
    from app.models.al_prediction_history import ALPredictionHistory
    from app.models.al_queue_snapshot import ALQueueSnapshot
    from app.models.ml_dataset_version import MLDatasetVersion
    from app.models.ml_deployment import MLDeployment
    from app.models.ml_evaluation_run import MLEvaluationRun
    from app.models.offline_collocation_index import OfflineCollocationIndex
    from app.models.offline_context_index import OfflineContextIndex
    from app.models.offline_index_version import OfflineIndexVersion
    from app.models.offline_lexicon_index import OfflineLexiconIndex
    from app.models.offline_pattern_index import OfflinePatternIndex
    from app.models.offline_rebuild_job import OfflineRebuildJob
    from app.models.supply_candidate_snapshot import SupplyCandidateSnapshot
    from app.models.supply_demand_profile import SupplyDemandProfile
    from app.models.supply_recommendation_snapshot import SupplyRecommendationSnapshot
    from app.models.user_word_registry import UserWordRegistry
    from app.models.metric_fact import MetricFact
    from app.models.workflow_metrics_snapshot import WorkflowMetricsSnapshot
    from app.models.efficiency_observation import EfficiencyObservation

    MLDatasetVersion.__table__.create(bind=engine, checkfirst=True)
    MLEvaluationRun.__table__.create(bind=engine, checkfirst=True)
    MLDeployment.__table__.create(bind=engine, checkfirst=True)
    ALQueueSnapshot.__table__.create(bind=engine, checkfirst=True)
    ALPredictionHistory.__table__.create(bind=engine, checkfirst=True)
    UserWordRegistry.__table__.create(bind=engine, checkfirst=True)
    SupplyDemandProfile.__table__.create(bind=engine, checkfirst=True)
    SupplyCandidateSnapshot.__table__.create(bind=engine, checkfirst=True)
    SupplyRecommendationSnapshot.__table__.create(bind=engine, checkfirst=True)
    OfflineIndexVersion.__table__.create(bind=engine, checkfirst=True)
    OfflinePatternIndex.__table__.create(bind=engine, checkfirst=True)
    OfflineContextIndex.__table__.create(bind=engine, checkfirst=True)
    OfflineCollocationIndex.__table__.create(bind=engine, checkfirst=True)
    OfflineLexiconIndex.__table__.create(bind=engine, checkfirst=True)
    OfflineRebuildJob.__table__.create(bind=engine, checkfirst=True)
    MetricFact.__table__.create(bind=engine, checkfirst=True)
    WorkflowMetricsSnapshot.__table__.create(bind=engine, checkfirst=True)
    EfficiencyObservation.__table__.create(bind=engine, checkfirst=True)

    insp = inspect(engine)
    if "training_run" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("training_run")}
        alters: list[str] = []
        if "dataset_version_id" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN dataset_version_id VARCHAR(36)")
        if "git_sha" not in cols:
            alters.append("ALTER TABLE training_run ADD COLUMN git_sha VARCHAR(64)")
        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))

    if "model_snapshot" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("model_snapshot")}
        alters = []
        if "dataset_version_id" not in cols:
            alters.append("ALTER TABLE model_snapshot ADD COLUMN dataset_version_id VARCHAR(36)")
        if "git_sha" not in cols:
            alters.append("ALTER TABLE model_snapshot ADD COLUMN git_sha VARCHAR(64)")
        if "artifact_manifest_uri" not in cols:
            alters.append("ALTER TABLE model_snapshot ADD COLUMN artifact_manifest_uri VARCHAR(4096)")
        if "label_schema_version" not in cols:
            alters.append("ALTER TABLE model_snapshot ADD COLUMN label_schema_version VARCHAR(128)")
        if "metrics_json" not in cols:
            alters.append("ALTER TABLE model_snapshot ADD COLUMN metrics_json TEXT")
        if "model_family" not in cols:
            alters.append("ALTER TABLE model_snapshot ADD COLUMN model_family VARCHAR(128)")
        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))

    if "al_queue_snapshot" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("al_queue_snapshot")}
        if "selected_list_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE al_queue_snapshot ADD COLUMN selected_list_id VARCHAR(36)"))

    if "al_prediction_history" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("al_prediction_history")}
        if "selected_list_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE al_prediction_history ADD COLUMN selected_list_id VARCHAR(36)"))

    if "model_review_feedback" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("model_review_feedback")}
        alters = []
        if "span_start" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN span_start INTEGER")
        if "span_end" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN span_end INTEGER")
        if "span_key" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN span_key VARCHAR(512)")
        if "feedback_type" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN feedback_type VARCHAR(64)")
        if "severity" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN severity VARCHAR(32)")
        if "lab_delta_mean" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN lab_delta_mean FLOAT")
        if "prom_delta_mean" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN prom_delta_mean FLOAT")
        if "spr_delta_mean" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN spr_delta_mean FLOAT")
        if "boundary_edit_count" not in cols:
            alters.append("ALTER TABLE model_review_feedback ADD COLUMN boundary_edit_count INTEGER")
        if "is_retrain_eligible" not in cols:
            alters.append(
                "ALTER TABLE model_review_feedback ADD COLUMN is_retrain_eligible BOOLEAN NOT NULL DEFAULT 0"
            )
        if "schema_version" not in cols:
            alters.append(
                "ALTER TABLE model_review_feedback ADD COLUMN schema_version VARCHAR(64) NOT NULL DEFAULT 'review_feedback_v1'"
            )
        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))

    _ensure_dataset_meta_columns(engine)
    _ensure_ml_deployment_unique_active_index(engine)


def _ensure_dataset_meta_columns(engine: Engine) -> None:
    """Add is_canonical_root / import_source when SQLite DB predates Alembic."""
    insp = inspect(engine)
    if "dataset" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("dataset")}
    alters: list[str] = []
    if "is_canonical_root" not in cols:
        alters.append(
            "ALTER TABLE dataset ADD COLUMN is_canonical_root BOOLEAN NOT NULL DEFAULT 0"
        )
    if "import_source" not in cols:
        alters.append("ALTER TABLE dataset ADD COLUMN import_source VARCHAR(64)")
    if alters:
        with engine.begin() as conn:
            for sql in alters:
                conn.execute(text(sql))


_UQ_ML_DEP_ACTIVE = "uq_ml_deployment_one_active_per_alias"


def _ensure_syllable_phonology_columns(engine: Engine) -> None:
    """word_pronunciation_cache + stimulus/annotation/span columns (SQLite without Alembic)."""
    from app.models.word_pronunciation_cache import WordPronunciationCache

    insp = inspect(engine)
    if "word_pronunciation_cache" not in insp.get_table_names():
        WordPronunciationCache.__table__.create(bind=engine, checkfirst=True)
        insp = inspect(engine)
    if "word_pronunciation_cache" in insp.get_table_names():
        idx_names = {ix["name"] for ix in insp.get_indexes("word_pronunciation_cache") if ix.get("name")}
        if "ix_word_pron_cache_word_version" not in idx_names:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_word_pron_cache_word_version "
                        "ON word_pronunciation_cache (normalized_word, preprocessing_version)"
                    )
                )

    if "stimulus" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("stimulus")}
        alters: list[str] = []
        if "pronunciation_cache_json" not in cols:
            alters.append("ALTER TABLE stimulus ADD COLUMN pronunciation_cache_json TEXT")
        if "stress_pattern" not in cols:
            alters.append("ALTER TABLE stimulus ADD COLUMN stress_pattern VARCHAR(32)")
        if "syllable_count" not in cols:
            alters.append("ALTER TABLE stimulus ADD COLUMN syllable_count INTEGER")
        if "preprocessing_version" not in cols:
            alters.append("ALTER TABLE stimulus ADD COLUMN preprocessing_version VARCHAR(64)")
        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))

    if "annotation" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("annotation")}
        alters = []
        spec = [
            ("subjective_mode", "ALTER TABLE annotation ADD COLUMN subjective_mode VARCHAR(32)"),
            ("best_color_lab_l", "ALTER TABLE annotation ADD COLUMN best_color_lab_l FLOAT"),
            ("best_color_lab_a", "ALTER TABLE annotation ADD COLUMN best_color_lab_a FLOAT"),
            ("best_color_lab_b", "ALTER TABLE annotation ADD COLUMN best_color_lab_b FLOAT"),
            ("best_color_hex", "ALTER TABLE annotation ADD COLUMN best_color_hex VARCHAR(16)"),
            ("dominant_letter_idx", "ALTER TABLE annotation ADD COLUMN dominant_letter_idx INTEGER"),
            ("accept_or_revise", "ALTER TABLE annotation ADD COLUMN accept_or_revise VARCHAR(32)"),
            ("response_confidence", "ALTER TABLE annotation ADD COLUMN response_confidence FLOAT"),
            ("picker_start_hex", "ALTER TABLE annotation ADD COLUMN picker_start_hex VARCHAR(16)"),
            ("picker_moved_flag", "ALTER TABLE annotation ADD COLUMN picker_moved_flag BOOLEAN"),
            ("skip_flag", "ALTER TABLE annotation ADD COLUMN skip_flag BOOLEAN"),
            ("annotation_extras_json", "ALTER TABLE annotation ADD COLUMN annotation_extras_json TEXT"),
        ]
        for name, sql in spec:
            if name not in cols:
                alters.append(sql)
        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))

    if "span" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("span")}
        alters = []
        spec = [
            ("syllable_idx", "ALTER TABLE span ADD COLUMN syllable_idx INTEGER"),
            ("is_in_stressed_syllable", "ALTER TABLE span ADD COLUMN is_in_stressed_syllable BOOLEAN"),
            ("is_stressed_nucleus", "ALTER TABLE span ADD COLUMN is_stressed_nucleus BOOLEAN"),
            ("char_role_in_syllable", "ALTER TABLE span ADD COLUMN char_role_in_syllable VARCHAR(16)"),
        ]
        for name, sql in spec:
            if name not in cols:
                alters.append(sql)
        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))


def ensure_lab_profile_schema(engine: Engine) -> None:
    """Add Build Your Own lab_* columns for SQLite DBs created before these fields."""
    insp = inspect(engine)
    if "lab_profile" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("lab_profile")}
        alters: list[str] = []
        if "display_name" not in cols:
            alters.append("ALTER TABLE lab_profile ADD COLUMN display_name VARCHAR(128) NOT NULL DEFAULT ''")
        if "slug" not in cols:
            alters.append("ALTER TABLE lab_profile ADD COLUMN slug VARCHAR(80) NOT NULL DEFAULT ''")
        if "palette_history_json" not in cols:
            alters.append("ALTER TABLE lab_profile ADD COLUMN palette_history_json TEXT NOT NULL DEFAULT '[]'")
        if "last_active_at" not in cols:
            alters.append("ALTER TABLE lab_profile ADD COLUMN last_active_at TIMESTAMP")
        if "coverage_kb_vocab_version_id" not in cols:
            alters.append(
                "ALTER TABLE lab_profile ADD COLUMN coverage_kb_vocab_version_id VARCHAR(36)"
            )
        if "lab_participant_key" not in cols:
            alters.append("ALTER TABLE lab_profile ADD COLUMN lab_participant_key VARCHAR(64)")
        if "track" not in cols:
            alters.append("ALTER TABLE lab_profile ADD COLUMN track VARCHAR(16) NOT NULL DEFAULT 'deep'")
        if "coverage_anchor_words_json" not in cols:
            alters.append(
                "ALTER TABLE lab_profile ADD COLUMN coverage_anchor_words_json TEXT NOT NULL DEFAULT '[]'"
            )
        if "coverage_assist_words_json" not in cols:
            alters.append(
                "ALTER TABLE lab_profile ADD COLUMN coverage_assist_words_json TEXT NOT NULL DEFAULT '[]'"
            )
        if "user_pattern_lexicon_json" not in cols:
            alters.append(
                "ALTER TABLE lab_profile ADD COLUMN user_pattern_lexicon_json TEXT NOT NULL DEFAULT '{}'"
            )
        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))
        # One stable key per non-null participant (SQLite treats NULLs as distinct in UNIQUE).
        insp = inspect(engine)
        idx_names = {ix["name"] for ix in insp.get_indexes("lab_profile") if ix.get("name")}
        if "uq_lab_profile_lab_participant_key" not in idx_names:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_profile_lab_participant_key "
                        "ON lab_profile (lab_participant_key)"
                    )
                )
    if "lab_letter_annotation" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("lab_letter_annotation")}
        alters = []
        if "lab_l" not in cols:
            alters.append("ALTER TABLE lab_letter_annotation ADD COLUMN lab_l FLOAT NOT NULL DEFAULT 72.0")
        if "lab_a" not in cols:
            alters.append("ALTER TABLE lab_letter_annotation ADD COLUMN lab_a FLOAT NOT NULL DEFAULT 8.0")
        if "lab_b" not in cols:
            alters.append("ALTER TABLE lab_letter_annotation ADD COLUMN lab_b FLOAT NOT NULL DEFAULT -28.0")
        if "prominence" not in cols:
            alters.append("ALTER TABLE lab_letter_annotation ADD COLUMN prominence FLOAT NOT NULL DEFAULT 0.62")
        if "spread" not in cols:
            alters.append("ALTER TABLE lab_letter_annotation ADD COLUMN spread FLOAT NOT NULL DEFAULT 0.38")
        if alters:
            with engine.begin() as conn:
                for sql in alters:
                    conn.execute(text(sql))
    if "lab_coverage_word" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("lab_coverage_word")}
        if "coverage_tier" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE lab_coverage_word ADD COLUMN coverage_tier VARCHAR(16) NOT NULL DEFAULT 'legacy'"
                    )
                )

    _ensure_syllable_phonology_columns(engine)


def _ensure_ml_deployment_unique_active_index(engine: Engine) -> None:
    """Partial unique index: at most one active row per (env, product, task, alias)."""
    insp = inspect(engine)
    if "ml_deployment" not in insp.get_table_names():
        return
    names = {ix["name"] for ix in insp.get_indexes("ml_deployment") if ix.get("name")}
    if _UQ_ML_DEP_ACTIVE in names:
        return
    with engine.begin() as conn:
        dedupe_active_ml_deployments(conn)
        conn.execute(
            text(
                f"CREATE UNIQUE INDEX {_UQ_ML_DEP_ACTIVE} ON ml_deployment "
                "(environment, product_line, task_name, alias) WHERE is_active = 1"
            )
        )
