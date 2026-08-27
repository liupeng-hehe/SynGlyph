from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(
        default="sqlite:///./synglyph.db",
        validation_alias=AliasChoices("DATABASE_URL", "database_url"),
    )
    # Override repo default data/glyph_segments (absolute path); env: GLYPH_SEGMENTS_ROOT
    glyph_segments_root: str | None = None
    # Absolute path to letter_sequence .pt checkpoint for /api/letter-sequence/predict; env: LETTER_SEQUENCE_CHECKPOINT
    letter_sequence_checkpoint: str | None = None
    # Optional override for deploy manifest (default: <repo>/configs/letter_sequence/stable_checkpoints.json)
    stable_checkpoints_path: str | None = Field(
        default=None, validation_alias=AliasChoices("STABLE_CHECKPOINTS_PATH", "stable_checkpoints_path")
    )
    # Set to 1 to allow POST /api/models/export-onnx and POST /api/models/parity-test
    enable_model_runtime_mutations: bool = Field(
        default=False, validation_alias=AliasChoices("ENABLE_MODEL_RUNTIME_MUTATIONS", "enable_model_runtime_mutations")
    )
    # Override repo default data/chinese_glyphs; env: CHINESE_GLYPH_DATA_ROOT
    chinese_glyph_data_root: str | None = None
    # Phase 1 ML artifacts root (datasets/models/evals); env: ARTIFACTS_ROOT
    artifacts_root: str | None = None
    # Deployment environment for champion resolution; env: SYNGLYPH_ML_ENV
    ml_environment: str = "dev"
    # When false, POST /api/lab/train returns 503 (use on serverless / multi-replica without shared artifacts).
    lab_training_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("LAB_TRAINING_ENABLED", "lab_training_enabled"),
    )
    # Comma-separated browser origins, or * (dev only). Env: SYNGLYPH_CORS_ORIGINS or CORS_ALLOW_ORIGINS
    cors_allow_origins: str = Field(
        default="*",
        validation_alias=AliasChoices("SYNGLYPH_CORS_ORIGINS", "CORS_ALLOW_ORIGINS"),
    )
    # colorrec sentence-transformer retrieval (color-semantic-model)
    colorrec_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("COLORREC_ENABLED", "colorrec_enabled"),
    )
    colorrec_repo_root: str | None = Field(
        default=None,
        validation_alias=AliasChoices("COLORREC_REPO_ROOT", "colorrec_repo_root"),
    )
    colorrec_config: str | None = Field(
        default=None,
        validation_alias=AliasChoices("COLORREC_CONFIG", "colorrec_config"),
    )
    colorrec_model_path: str | None = Field(
        default=None,
        validation_alias=AliasChoices("COLORREC_MODEL_PATH", "colorrec_model_path"),
    )
    colorrec_embeddings_path: str | None = Field(
        default=None,
        validation_alias=AliasChoices("COLORREC_EMBEDDINGS_PATH", "colorrec_embeddings_path"),
    )


settings = Settings()
# SQLite: enable cross-thread use + longer busy timeout to reduce transient lock errors.
connect_args = (
    {}
    if "sqlite" not in settings.database_url
    else {"check_same_thread": False, "timeout": 30}
)
engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=bool("sqlite" not in settings.database_url),
)

if "sqlite" in settings.database_url:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
