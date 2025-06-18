from flask import Flask, jsonify, request
from flask_cors import CORS
import uuid
import datetime
from database import get_db_connection # Custom database module

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

def format_datetime_for_json(dt_obj):
    """Converts datetime object to ISO 8601 string, or None if None."""
    if isinstance(dt_obj, str): # If it's already a string, assume it's correctly formatted
        return dt_obj
    return dt_obj.isoformat() if dt_obj else None

def row_to_dict(row):
    """Converts a sqlite3.Row object to a dictionary, formatting datetimes."""
    if row is None:
        return None
    d = dict(row)
    for key, value in d.items():
        if isinstance(value, datetime.datetime):
            d[key] = format_datetime_for_json(value)
        # SQLite stores DATETIME as strings sometimes, ensure they are also ISO formatted if direct from DB
        elif isinstance(value, str) and key in ['start_time', 'end_time', 'completion_time']:
             try:
                # Attempt to parse and reformat to ensure ISO 8601 T separator
                dt_obj = datetime.datetime.fromisoformat(value.replace(' ', 'T'))
                d[key] = dt_obj.isoformat()
             except ValueError:
                # If parsing fails, leave as is or handle error
                pass # Or log a warning
    return d

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        conn = get_db_connection()
        conn.close()
        return jsonify({"status": "healthy", "database_connection": "ok"})
    except Exception as e:
        return jsonify({"status": "unhealthy", "database_connection": "error", "error_details": str(e)}), 500

@app.route('/api/sessions', methods=['POST'])
def create_session():
    user_id = request.json.get('userId', 'default_user')
    new_session_id = uuid.uuid4().hex
    start_time = datetime.datetime.now()

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO workout_sessions (session_id, user_id, start_time) VALUES (?, ?, ?)",
            (new_session_id, user_id, start_time)
        )
        conn.commit()
        return jsonify({
            "sessionId": new_session_id,
            "userId": user_id,
            "startTime": format_datetime_for_json(start_time)
        }), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": "Database error creating session", "details": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/sessions', methods=['GET'])
def get_all_sessions():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT session_id, user_id, start_time, end_time, notes FROM workout_sessions ORDER BY start_time DESC")
        # Use row_to_dict for consistent datetime formatting and column access
        sessions_list = [row_to_dict(row) for row in cursor.fetchall()]
        return jsonify(sessions_list), 200
    except Exception as e:
        return jsonify({"error": "Database error fetching sessions", "details": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/sessions/<session_id>/end', methods=['PUT'])
def end_session(session_id):
    end_time = datetime.datetime.now()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM workout_sessions WHERE session_id = ?", (session_id,))
        session_row = cursor.fetchone()
        if not session_row:
            return jsonify({"error": "Session not found"}), 404

        cursor.execute(
            "UPDATE workout_sessions SET end_time = ? WHERE session_id = ?",
            (end_time, session_id)
        )
        conn.commit()
        return jsonify({
            "message": "Session ended",
            "sessionId": session_id,
            "endTime": format_datetime_for_json(end_time)
        }), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": "Database error ending session", "details": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/sessions/<session_id>/sets', methods=['POST'])
def create_set_for_session(session_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    required_fields = ['exerciseName', 'setNumber']
    for field in required_fields:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    new_set_id = uuid.uuid4().hex
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT session_id FROM workout_sessions WHERE session_id = ?", (session_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"error": "Session not found"}), 404

        cursor.execute(
            """INSERT INTO workout_sets
               (set_id, session_id, exercise_name, set_number, target_reps, target_weight, status)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (new_set_id, session_id, data['exerciseName'], data['setNumber'],
             data.get('targetReps'), data.get('targetWeight'), data.get('status', 'pending'))
        )
        conn.commit()

        cursor.execute("SELECT * FROM workout_sets WHERE set_id = ?", (new_set_id,))
        created_set = row_to_dict(cursor.fetchone())
        return jsonify(created_set), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": "Database error creating set", "details": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/sessions/<session_id>/sets', methods=['GET'])
def get_sets_for_session(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT session_id FROM workout_sessions WHERE session_id = ?", (session_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({"error": "Session not found"}), 404

        cursor.execute("SELECT * FROM workout_sets WHERE session_id = ? ORDER BY set_number", (session_id,))
        sets_rows = cursor.fetchall()
        sets_list = [row_to_dict(row) for row in sets_rows]
        return jsonify(sets_list), 200
    except Exception as e:
        return jsonify({"error": "Database error fetching sets", "details": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/sets/<set_id>', methods=['PUT'])
def update_set_details(set_id):
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON payload"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM workout_sets WHERE set_id = ?", (set_id,))
        current_set_row = cursor.fetchone()
        if not current_set_row:
            conn.close()
            return jsonify({"error": "Set not found"}), 404

        current_set = row_to_dict(current_set_row) # Ensure current_set times are also formatted for comparison

        # Fields that can be updated
        status = data.get('status', current_set['status'])
        completion_time_val = current_set['completion_time'] # Keep existing if not changing status away from pending

        if status != 'pending' and current_set['status'] == 'pending': # If status changes from pending to something else
            completion_time_val = datetime.datetime.now()
        elif status == 'pending': # If status is reset to pending
             completion_time_val = None


        update_values = {
            'exercise_name': data.get('exerciseName', current_set['exercise_name']),
            'target_reps': data.get('targetReps', current_set['target_reps']),
            'target_weight': data.get('targetWeight', current_set['target_weight']),
            'set_number': data.get('setNumber', current_set['set_number']),
            'actual_reps': data.get('actualReps', current_set['actual_reps']),
            'actual_weight': data.get('actualWeight', current_set['actual_weight']),
            'status': status,
            'completion_time': completion_time_val
        }

        cursor.execute(
            """UPDATE workout_sets SET
               exercise_name = ?, target_reps = ?, target_weight = ?, set_number = ?,
               actual_reps = ?, actual_weight = ?, status = ?, completion_time = ?
               WHERE set_id = ?""",
            (update_values['exercise_name'], update_values['target_reps'], update_values['target_weight'],
             update_values['set_number'], update_values['actual_reps'], update_values['actual_weight'],
             update_values['status'], update_values['completion_time'], set_id)
        )
        conn.commit()

        cursor.execute("SELECT * FROM workout_sets WHERE set_id = ?", (set_id,))
        updated_set = row_to_dict(cursor.fetchone())
        return jsonify(updated_set), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": "Database error updating set", "details": str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
