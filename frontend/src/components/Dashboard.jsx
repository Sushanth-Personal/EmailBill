import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import styles from './Dashboard.module.css'; // Import CSS Module

function Dashboard() {
  const [user, setUser] = useState(null);
  const [emails, setEmails] = useState([]);
  const [matters, setMatters] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const location = useLocation();
  const backendUrl = process.env.REACT_APP_URL || 'http://localhost:5000';

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

  const handleSummarizeAndBill = async (email) => {
    try {
      const matter = matters.find(m => m.clientEmail?.toLowerCase() === email.to?.toLowerCase());
      if (!matter) {
        setError(`No matching matter found for email: ${email.to}`);
        return;
      }
      const summaryResponse = await axios.post(`${backendUrl}/api/summarize`, { text: email.body }, { withCredentials: true });
      const { summary, duration } = summaryResponse.data;
      const timeEntryResponse = await axios.post(`${backendUrl}/api/time-entry`, {
        matterId: matter.id,
        duration,
        description: summary,
        date: email.date,
      }, { withCredentials: true });
      setSuccess(`Time entry created for ${email.to}: ${timeEntryResponse.data.data.description}`);
      setTimeEntries([...timeEntries, timeEntryResponse.data.data]);
      setError(null);
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
          {user.google && user.clio && emails.length > 0 ? (
            <>
              <h2>Emails</h2>
              <ul className={styles.emailList}>
                {emails.map((email, index) => (
                  <li key={email.id || index} className={styles.emailItem}>
                    <div className={styles.emailText}>
                      <strong>{email.subject}</strong>
                      <p>
                        To: {email.to} | Date: {new Date(email.date).toLocaleString()}
                      </p>
                      <p>{email.body.substring(0, 100) + '...'}</p>
                    </div>
                    <button className={styles.button} onClick={() => handleSummarizeAndBill(email)}>
                      Convert to Billable
                    </button>
                  </li>
                ))}
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
            <p>No emails to display. Ensure Google and Clio are connected.</p>
          )}
        </>
      ) : (
        <p>Loading user data...</p>
      )}
    </div>
  );
}

export default Dashboard;