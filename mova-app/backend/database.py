import sqlite3
import os

DATABASE_URL = os.path.join(os.path.dirname(__file__), 'mova.db')

def get_db_connection():
    conn = sqlite3.connect(DATABASE_URL)
    conn.row_factory = sqlite3.Row # Access columns by name
    return conn

def init_db():
    db_existed = os.path.exists(DATABASE_URL)

    conn = get_db_connection()
    cursor = conn.cursor()

    # Create workout_sessions table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS workout_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        notes TEXT
    )
    ''')
    print("Table 'workout_sessions' checked/created.")

    # Create workout_sets table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS workout_sets (
        set_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        exercise_name TEXT NOT NULL,
        set_number INTEGER NOT NULL,
        target_reps INTEGER,
        target_weight REAL,
        actual_reps INTEGER,
        actual_weight REAL,
        status TEXT DEFAULT 'pending', /* pending, completed, skipped */
        completion_time DATETIME,
        FOREIGN KEY (session_id) REFERENCES workout_sessions (session_id)
    )
    ''')
    print("Table 'workout_sets' checked/created.")

    conn.commit()
    conn.close()

    if not db_existed:
        print(f"Database '{DATABASE_URL}' created and tables initialized.")
    else:
        print(f"Database '{DATABASE_URL}' already existed. Tables checked/created.")


if __name__ == '__main__':
    print(f"Initializing database at: {DATABASE_URL}")
    # For development, to ensure clean slate if script is re-run for table structure changes
    # BE CAREFUL WITH THIS IN PRODUCTION SCENARIOS
    # if os.path.exists(DATABASE_URL):
    #     print("Development: Removing existing database for re-initialization...")
    #     os.remove(DATABASE_URL)

    init_db()
