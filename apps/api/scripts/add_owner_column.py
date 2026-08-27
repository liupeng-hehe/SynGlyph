#!/usr/bin/env python3
"""
Safely add owner column to dataset table if missing.
Run: cd apps/api && .venv/bin/python scripts/add_owner_column.py
"""
import sqlite3
import os

# Find db path (match apps/api/app/db.py)
db_path = os.environ.get("DATABASE_URL", "sqlite:///./synglyph.db")
if db_path.startswith("sqlite:///"):
    db_path = db_path.replace("sqlite:///", "")
    if not os.path.isabs(db_path):
        db_path = os.path.join(os.path.dirname(__file__), "..", db_path)
else:
    db_path = os.path.join(os.path.dirname(__file__), "..", "synglyph.db")

def main():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(dataset)")
    cols = [r[1] for r in cur.fetchall()]
    if "owner" not in cols:
        cur.execute("ALTER TABLE dataset ADD COLUMN owner VARCHAR(64)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_dataset_owner ON dataset(owner)")
        cur.execute("UPDATE dataset SET owner = 'admin' WHERE owner IS NULL")
        conn.commit()
        print("Added owner column and index.")
    else:
        print("owner column already exists.")
    conn.close()

if __name__ == "__main__":
    main()
