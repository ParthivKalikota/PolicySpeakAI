from database import engine
from sqlalchemy import text

print("Migrating PostgreSQL database...")

try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS completed_modules VARCHAR NOT NULL DEFAULT '{}'"))
        conn.commit()
    print("Migration successful: added completed_modules column.")
except Exception as e:
    print(f"Migration error (might already exist): {e}")

