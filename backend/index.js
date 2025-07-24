const express = require('express');
const cors = require('cors');
const session = require('express-session');
const dotenv = require('dotenv');
const { google } = require('googleapis');
const axios = require('axios');
const morgan = require('morgan')

dotenv.config();


const app = express();
const PORT = process.env.PORT || 5000;

app.use(morgan());
// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true } // HTTPS for Render/Vercel
  })
);

// Google OAuth setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.get('/auth/google', (req, res) => {
    console.log("yousdfasd")
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    console.log("Yohoyouoyoy")
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    req.session.googleTokens = tokens;
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    res.status(500).send('Google authentication failed');
  }
});

// Clio OAuth setup
const CLIO_AUTH_URL = 'https://app.clio.com/oauth/authorize';
const CLIO_TOKEN_URL = 'https://app.clio.com/oauth/token';

app.get('/auth/clio', (req, res) => {
  if (!process.env.CLIO_CLIENT_ID || !process.env.CLIO_REDIRECT_URI) {
    return res.status(503).send('Clio credentials not configured');
  }
  const state = Math.random().toString(36).substring(2);
  req.session.oauthState = state;
  const url = `${CLIO_AUTH_URL}?response_type=code&client_id=${process.env.CLIO_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.CLIO_REDIRECT_URI)}&state=${state}`;
  res.redirect(url);
});

app.get('/auth/clio/callback', async (req, res) => {
  const { code, state } = req.query;
  if (state !== req.session.oauthState) {
    return res.status(400).send('Invalid state parameter');
  }
  try {
    const response = await axios.post(CLIO_TOKEN_URL, {
      client_id: process.env.CLIO_CLIENT_ID,
      client_secret: process.env.CLIO_CLIENT_SECRET,
      redirect_uri: process.env.CLIO_REDIRECT_URI,
      code,
      grant_type: 'authorization_code'
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    req.session.clioTokens = response.data;
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('Error in Clio OAuth callback:', error.response?.data || error);
    res.status(500).send('Clio authentication failed');
  }
});

// Email fetching
app.get('/api/emails', async (req, res) => {
  if (!req.session.googleTokens) {
    return res.status(401).send('Not authenticated with Google');
  }
  try {
    oauth2Client.setCredentials(req.session.googleTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      q: 'from:me'
    });
    const messages = response.data.messages || [];
    const emails = await Promise.all(
      messages.map(async (message) => {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });
        const headers = msg.data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const to = headers.find(h => h.name === 'To')?.value || 'Unknown';
        const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
        let body = '';
        if (msg.data.payload.parts) {
          const part = msg.data.payload.parts.find(p => p.mimeType === 'text/plain');
          if (part && part.body && part.body.data) {
            body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        } else if (msg.data.payload.body && msg.data.payload.body.data) {
          body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8');
        }
        return { id: message.id, subject, to, date, body };
      })
    );
    res.json(emails);
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).send('Failed to fetch emails');
  }
});

// Summarize emails
app.post('/api/summarize', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).send('Text is required');
  }
  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
      { inputs: text },
      { headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}` } }
    );
    const summary = response.data[0]?.generated_text || 'No summary generated';
    const duration = 0.5; // Default 30 minutes
    res.json({ summary, duration });
  } catch (error) {
    console.error('Error summarizing text:', error);
    res.status(500).send('Failed to summarize text');
  }
});

// Fetch Clio matters
app.get('/api/matters', async (req, res) => {
  if (!req.session.clioTokens) {
    return res.status(401).send('Not authenticated with Clio');
  }
  try {
    const response = await axios.get('https://app.clio.com/api/v4/matters', {
      headers: { Authorization: `Bearer ${req.session.clioTokens.access_token}` }
    });
    const matters = response.data.data.map(matter => ({
      id: matter.id,
      display_name: matter.description,
      clientEmail: matter.client?.email || ''
    }));
    res.json(matters);
  } catch (error) {
    console.error('Error fetching Clio matters:', error.response?.data || error);
    res.status(500).send('Failed to fetch matters');
  }
});

// Create Clio time entries
app.post('/api/time-entry', async (req, res) => {
  if (!req.session.clioTokens) {
    return res.status(401).send('Not authenticated with Clio');
  }
  const { matterId, duration, description, date } = req.body;
  if (!matterId || !duration || !description || !date) {
    return res.status(400).send('Missing required fields');
  }
  try {
    const response = await axios.post(
      'https://app.clio.com/api/v4/activities',
      {
        matter: { id: parseInt(matterId) },
        quantity: duration * 3600, // Clio uses seconds
        description: description,
        date: date.split('T')[0], // YYYY-MM-DD
        type: 'TimeEntry'
      },
      {
        headers: { Authorization: `Bearer ${req.session.clioTokens.access_token}` }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error creating Clio time entry:', error.response?.data || error);
    res.status(500).send('Failed to create time entry');
  }
});

app.get('/', (req, res) => {
  res.send('EmailBill Backend is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});