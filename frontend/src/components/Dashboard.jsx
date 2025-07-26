import React, { useState, useEffect } from 'react';
import { Container, Typography, Button, List, ListItem, ListItemText } from '@mui/material';
import axios from 'axios';

function Dashboard() {
  const [emails, setEmails] = useState([]);
  const [matters, setMatters] = useState([]);

  // useEffect(() => {
  //   const fetchEmails = async () => {
  //     try {
  //       const response = await axios.get('https://emailbill.onrender.com/api/emails', { withCredentials: true });
  //       setEmails(response.data);
  //     } catch (error) {
  //       console.error('Error fetching emails:', error);
  //     }
  //   };
  //   const fetchMatters = async () => {
  //     try {
  //       const response = await axios.get('https://emailbill.onrender.com/api/matters', { withCredentials: true });
  //       setMatters(response.data);
  //     } catch (error) {
  //       console.error('Error fetching matters:', error);
  //     }
  //   };
  //   fetchEmails();
  //   fetchMatters();
  // }, []);

  const handleSummarizeAndBill = async (email) => {
    try {
      const matter = matters.find(m => m.clientEmail.toLowerCase() === email.to.toLowerCase());
      if (!matter) {
        alert('No matching Matter found for email: ' + email.to);
        return;
      }
      const summaryResponse = await axios.post('https://emailbill.onrender.com/api/summarize', { text: email.body }, { withCredentials: true });
      const { summary, duration } = summaryResponse.data;
      const timeEntryResponse = await axios.post(
        'https://emailbill.onrender.com/api/time-entry',
        {
          matterId: matter.id,
          duration,
          description: summary,
          date: email.date
        },
        { withCredentials: true }
      );
      alert('Time entry created for ' + email.to + ': ' + JSON.stringify(timeEntryResponse.data));
    } catch (error) {
      console.error('Error creating time entry:', error);
      alert('Failed to create time entry');
    }
  };

  return (
    <Container maxWidth="md" style={{ textAlign: 'center', marginTop: '50px' }}>
      <Typography variant="h4" gutterBottom>
        EmailBill - Dashboard
      </Typography>
      {/* <List>
        {emails.map((email) => (
          <ListItem key={email.id}>
            <ListItemText
              primary={email.subject}
              secondary={`To: ${email.to} | Date: ${new Date(email.date).toLocaleString()} | ${email.body.substring(0, 100)}...`}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleSummarizeAndBill(email)}
            >
              Convert to Billable
            </Button>
          </ListItem>
        ))}
      </List> */}
    </Container>
  );
}

export default Dashboard;