import React, { useState, useEffect, FormEvent } from 'react';
import './App.css';

const API_URL = 'http://localhost:5000/api';

interface WorkoutSet { // Renamed from Set to avoid conflict with built-in Set
  set_id: string; // From backend (was setId)
  session_id: string; // From backend
  exercise_name: string; // From backend
  target_reps: number;
  target_weight: number;
  set_number: number;
  actual_reps?: number;
  actual_weight?: number;
  status: 'pending' | 'completed' | 'skipped';
  completion_time?: string; // From backend
}

interface Session {
  session_id: string; // From backend
  user_id: string; // From backend
  start_time: string;
  end_time?: string;
  notes?: string;
}

function App() {
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Session state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionsHistory, setSessionsHistory] = useState<Session[]>([]);

  // New set form state
  const [exerciseName, setExerciseName] = useState<string>('');
  const [targetReps, setTargetReps] = useState<string>('');
  const [targetWeight, setTargetWeight] = useState<string>('');
  const [setNumber, setSetNumber] = useState<string>('');

  // Update set state
  const [editingSetId, setEditingSetId] = useState<string | null>(null); // This is WorkoutSet.set_id
  const [actualReps, setActualReps] = useState<string>('');
  const [actualWeight, setActualWeight] = useState<string>('');

  // Fetch all sessions (history)
  const fetchSessionsHistory = async () => {
    setIsLoadingSession(true);
    try {
      const response = await fetch(`${API_URL}/sessions`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: Session[] = await response.json();
      setSessionsHistory(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch session history.');
    } finally {
      setIsLoadingSession(false);
    }
  };

  // Fetch sets for the current session
  const fetchSetsForCurrentSession = async (sessionId: string) => {
    if (!sessionId) {
      setSets([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}/sets`);
      if (!response.ok) {
        // If session not found on backend (e.g. after a server restart with in-memory DB), clear session
        if(response.status === 404) {
            setCurrentSessionId(null);
            setSets([]);
            throw new Error(`Session ${sessionId} not found. Please start a new session.`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: WorkoutSet[] = await response.json();
      setSets(data);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch sets.');
      setSets([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionsHistory();
    // Attempt to load currentSessionId from localStorage if available (basic persistence)
    const savedSessionId = localStorage.getItem('currentSessionId');
    if (savedSessionId) {
        setCurrentSessionId(savedSessionId);
        fetchSetsForCurrentSession(savedSessionId);
    }
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('currentSessionId', currentSessionId);
      fetchSetsForCurrentSession(currentSessionId);
    } else {
      localStorage.removeItem('currentSessionId');
      setSets([]); // Clear sets if no active session
    }
  }, [currentSessionId]);


  const handleStartSession = async () => {
    setError(null);
    setIsLoadingSession(true);
    try {
      const response = await fetch(`${API_URL}/sessions`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId: 'frontendUser' }) }); // Example userId
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: { sessionId: string } = await response.json();
      setCurrentSessionId(data.sessionId);
      setSets([]); // Start with an empty list of sets for the new session
      await fetchSessionsHistory(); // Refresh history
    } catch (e: any) {
      setError(e.message || 'Failed to start session.');
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleEndSession = async () => {
    if (!currentSessionId) return;
    setError(null);
    setIsLoadingSession(true);
    try {
      const response = await fetch(`${API_URL}/sessions/${currentSessionId}/end`, { method: 'PUT' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      setCurrentSessionId(null);
      setSets([]);
      await fetchSessionsHistory(); // Refresh history
    } catch (e: any) {
      setError(e.message || 'Failed to end session.');
    } finally {
      setIsLoadingSession(false);
    }
  };

  const handleAddSet = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentSessionId) {
      setError("No active session. Please start a new workout.");
      return;
    }
    setError(null);
    const newSetData = {
      exerciseName,
      targetReps: parseInt(targetReps, 10),
      targetWeight: parseInt(targetWeight, 10),
      setNumber: parseInt(setNumber, 10),
    };

    if (!exerciseName || isNaN(newSetData.targetReps) || isNaN(newSetData.targetWeight) || isNaN(newSetData.setNumber)) {
      setError("Please fill in all fields for the new set correctly.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/sessions/${currentSessionId}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSetData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      await fetchSetsForCurrentSession(currentSessionId);
      setExerciseName(''); setTargetReps(''); setTargetWeight(''); setSetNumber('');
    } catch (e: any) {
      setError(e.message || 'Failed to add set.');
    } finally {
        setIsLoading(false);
    }
  };

  const handleStartEdit = (set: WorkoutSet) => {
    setEditingSetId(set.set_id); // Use set_id from WorkoutSet
    setActualReps(set.actual_reps?.toString() || '');
    setActualWeight(set.actual_weight?.toString() || '');
  };

  const handleCancelEdit = () => {
    setEditingSetId(null);
    setActualReps('');
    setActualWeight('');
  };

  const handleSaveCompletion = async (setToUpdateId: string) => { // Renamed from setId to avoid confusion
    if (!currentSessionId) return;
    setError(null);
    const updateData = {
      actualReps: parseInt(actualReps, 10),
      actualWeight: parseInt(actualWeight, 10),
      status: 'completed' as 'completed',
    };

    if (isNaN(updateData.actualReps) || isNaN(updateData.actualWeight)) {
        setError("Please fill in actual reps and weight correctly.");
        return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/sets/${setToUpdateId}`, { // Global set_id for update
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      await fetchSetsForCurrentSession(currentSessionId);
      setEditingSetId(null); setActualReps(''); setActualWeight('');
    } catch (e: any) {
      setError(e.message || 'Failed to update set.');
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Mova Workout Tracker</h1>
      </header>
      <main>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}

        <section>
          <h2>Session Control</h2>
          {isLoadingSession && <p>Processing session change...</p>}
          {!currentSessionId ? (
            <button onClick={handleStartSession} disabled={isLoadingSession}>Start New Workout</button>
          ) : (
            <div>
              <p><strong>Active Session ID: {currentSessionId}</strong></p>
              <button onClick={handleEndSession} disabled={isLoadingSession}>End Current Workout</button>
            </div>
          )}
        </section>

        <section>
          <h2>Add New Set</h2>
          <form onSubmit={handleAddSet}>
            {/* Inputs remain the same, but now depend on currentSessionId for submission */}
            <div><label>Exercise Name: </label><input type="text" value={exerciseName} onChange={e => setExerciseName(e.target.value)} required disabled={!currentSessionId || isLoading} /></div>
            <div><label>Target Reps: </label><input type="number" value={targetReps} onChange={e => setTargetReps(e.target.value)} required disabled={!currentSessionId || isLoading} /></div>
            <div><label>Target Weight (kg): </label><input type="number" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} required disabled={!currentSessionId || isLoading} /></div>
            <div><label>Set Number: </label><input type="number" value={setNumber} onChange={e => setSetNumber(e.target.value)} required disabled={!currentSessionId || isLoading} /></div>
            <button type="submit" disabled={!currentSessionId || isLoading}>Add Set</button>
          </form>
        </section>

        <section>
          <h2>{currentSessionId ? `Sets for Session: ${currentSessionId}` : "No Active Session"}</h2>
          {isLoading && <p>Loading sets...</p>}
          {!currentSessionId && !isLoading && <p>Start a new workout to add sets.</p>}
          {currentSessionId && sets.length === 0 && !isLoading && <p>No sets added yet for this session.</p>}
          <ul>
            {sets.map(set => ( // set is WorkoutSet
              <li key={set.set_id} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
                <p><strong>{set.exercise_name}</strong> - Set {set.set_number}</p>
                <p>Target: {set.target_reps} reps @ {set.target_weight} kg</p>
                <p>Status: {set.status} {set.completion_time ? `(Completed: ${new Date(set.completion_time).toLocaleString()})` : ''}</p>
                {set.status === 'completed' && (
                  <p>Actual: {set.actual_reps} reps @ {set.actual_weight} kg</p>
                )}

                {set.status === 'pending' && editingSetId !== set.set_id && (
                  <button onClick={() => handleStartEdit(set)} disabled={!currentSessionId || isLoading}>
                    Mark as Complete
                  </button>
                )}

                {editingSetId === set.set_id && (
                  <div>
                    <h4>Complete Set</h4>
                    <div><label>Actual Reps: </label><input type="number" value={actualReps} onChange={e => setActualReps(e.target.value)} required /></div>
                    <div><label>Actual Weight (kg): </label><input type="number" value={actualWeight} onChange={e => setActualWeight(e.target.value)} required /></div>
                    <button onClick={() => handleSaveCompletion(set.set_id)} disabled={isLoading}>Save Completion</button>
                    <button onClick={handleCancelEdit} disabled={isLoading} style={{marginLeft: '10px'}}>Cancel</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Workout History</h2>
          {isLoadingSession && <p>Loading session history...</p>}
          {sessionsHistory.length === 0 && !isLoadingSession && <p>No past sessions found.</p>}
          <ul>
            {sessionsHistory.map(session => (
              <li key={session.session_id} style={{ border: '1px solid #eee', margin: '5px', padding: '5px' }}>
                <p>Session ID: {session.session_id}</p>
                <p>User: {session.user_id}</p>
                <p>Start: {new Date(session.start_time).toLocaleString()}</p>
                {session.end_time && <p>End: {new Date(session.end_time).toLocaleString()}</p>}
                {session.notes && <p>Notes: {session.notes}</p>}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;
