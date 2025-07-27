import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import styles from './Dashboard.module.css';

function Dashboard() {
  const [user, setUser] = useState(null);
  const [emails, setEmails] = useState([]);
  const [matters, setMatters] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedMatterId, setSelectedMatterId] = useState('');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  const location = useLocation();
  const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const error = urlParams.get('error');
    if (error) {
      setError(`Authentication failed: ${error}`);
    }

    const fetchUser = async () => {
      try {
        const response = await axios.get(`${backendUrl}/api/user`, { withCredentials: true });
        setUser(response.data);
      } catch (err) {
        setError('Failed to fetch user data. Please log in again.');
        console.error('User fetch error:', err);
      }
    };

    fetchUser();
  }, [location, backendUrl]);

  useEffect(() => {
    if (user?.google && user?.clio) {
      const fetchEmails = async () => {
        try {
          const response = await axios.get(`${backendUrl}/api/emails`, { withCredentials: true });
          setEmails(response.data);
        } catch (err) {
          setError('Failed to fetch emails.');
          console.error('Emails fetch error:', err);
        }
      };

      const fetchMatters = async () => {
        try {
          const response = await axios.get(`${backendUrl}/api/matters`, { withCredentials: true });
          console.log('Matter response:', response);
          setMatters(response.data);
        } catch (err) {
          setError('Failed to fetch matters.');
          console.error('Matters fetch error:', err);
        }
      };

      const fetchTimeEntries = async () => {
        try {
          const response = await axios.get(`${backendUrl}/api/time-entries`, { withCredentials: true });
          setTimeEntries(response.data);
        } catch (err) {
          setError('Failed to fetch time entries.');
          console.error('Time entries fetch error:', err);
        }
      };

      fetchEmails();
      fetchMatters();
      fetchTimeEntries();
    }
  }, [user, backendUrl]);

  const handleConnectClio = () => {
    window.location.href = `${backendUrl}/auth/clio`;
  };

  const handleLogTime = async (e) => {
    e.preventDefault();
    try {
      if (!selectedMatterId || !duration) {
        setError('Please select a matter and enter a duration.');
        return;
      }
      const response = await axios.post(
        `${backendUrl}/api/log-time`,
        {
          matterId: selectedMatterId,
          duration: parseFloat(duration),
          description: description || 'Billable activity for matter'
        },
        { withCredentials: true }
      );
      setSuccess(`Time entry created for Matter ID ${selectedMatterId}: ${response.data.timeEntry.description}`);
      setTimeEntries([...timeEntries, response.data.timeEntry]);
      setError(null);
      setDuration('');
      setDescription('');
      setSelectedMatterId('');
    } catch (error) {
      setError('Failed to create time entry.');
      console.error('Time entry error:', error);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>EmailBill Dashboard</h1>
      {error && <p className={styles.error}>{error}</p>}
      {success && <p className={styles.success}>{success}</p>}
      {user ? (
        <>
          <p className={styles.status}>Google: {user.google ? 'Connected' : 'Not Connected'}</p>
          <p className={styles.status}>Clio: {user.clio ? 'Connected' : 'Not Connected'}</p>
          {!user.clio && (
            <button className={styles.button} onClick={handleConnectClio}>
              Connect with Clio
            </button>
          )}
          {user.google && user.clio ? (
            <>
              <h2>Log Time Entry</h2>
              <form onSubmit={handleLogTime} className={styles.form}>
                <label>
                  Select Matter:
                  <select
                    value={selectedMatterId}
                    onChange={(e) => setSelectedMatterId(e.target.value)}
                    className={styles.select}
                  >
                    <option value="">Select a matter</option>
                    {matters.map((matter) => (
                      <option key={matter.id} value={matter.id}>
                        {matter.displayNumber} (ID: {matter.id})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Duration (hours):
                  <input
                    type="number"
                    step="0.1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className={styles.input}
                    placeholder="e.g., 1.0"
                  />
                </label>
                <label>
                  Description:
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={styles.input}
                    placeholder="Enter description"
                  />
                </label>
                <button type="submit" className={styles.button}>
                  Log Time
                </button>
              </form>

              <h2>Emails</h2>
              <ul className={styles.emailList}>
                {emails.length > 0 ? (
                  emails.map((email, index) => (
                    <li key={email.id || index} className={styles.emailItem}>
                      <div className={styles.emailText}>
                        <strong>{email.subject}</strong>
                        <p>
                          To: {email.to} | Date: {new Date(email.date).toLocaleString()}
                        </p>
                        <p>{email.body.substring(0, 100) + '...'}</p>
                      </div>
                    </li>
                  ))
                ) : (
                  <p>No emails to display.</p>
                )}
              </ul>

              <h2>Recent Time Entries</h2>
              <ul className={styles.timeEntryList}>
                {timeEntries.length > 0 ? (
                  timeEntries.map((entry, index) => (
                    <li key={entry.id || index} className={styles.timeEntryItem}>
                      <p>Description: {entry.description}</p>
                      <p>Date: {new Date(entry.date).toLocaleString()}</p>
                      <p>Duration: {entry.duration} hours</p>
                      <p>Matter ID: {entry.matterId}</p>
                    </li>
                  ))
                ) : (
                  <p>No time entries yet.</p>
                )}
              </ul>
            </>
          ) : (
            <p>No data to display. Ensure Google and Clio are connected.</p>
          )}
        </>
      ) : (
        <p>Loading user data...</p>
      )}
    </div>
  );
}

export default Dashboard;