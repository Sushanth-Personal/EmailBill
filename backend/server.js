require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2').Strategy;
const { google } = require('googleapis');
const axios = require('axios');

const app = express();

// Log environment variables for debugging
console.log('Environment Variables:', {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  CLIO_CLIENT_ID: process.env.CLIO_CLIENT_ID,
  CLIO_REDIRECT_URI: process.env.CLIO_REDIRECT_URI,
  FRONTEND_URL: process.env.FRONTEND_URL,
  PORT: process.env.PORT,
});

// Configure CORS
app.use(cors({
  origin: [process.env.FRONTEND_URL, 'http://localhost:5173'],
  credentials: true,
}));

// Configure session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secure_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' },
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport session serialization
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// Merge user data
function mergeUser(existingUser, newUser) {
  return {
    ...existingUser,
    ...newUser,
    google: existingUser?.google || newUser.google,
    clio: existingUser?.clio || newUser.clio,
  };
}

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_REDIRECT_URI,
  passReqToCallback: true,
}, (req, accessToken, refreshToken, profile, done) => {
  console.log('Google OAuth Callback:', { accessToken, refreshToken, profile });
  if (!accessToken || !profile) {
    return done(new Error('Invalid credentials or missing profile'));
  }
  const user = {
    google: {
      accessToken,
      refreshToken,
      profile,
    }
  };
  if (req.user) {
    return done(null, mergeUser(req.user, user));
  }
  return done(null, user);
}));

// Clio OAuth Strategy
passport.use('clio', new OAuth2Strategy({
  authorizationURL: 'https://app.clio.com/oauth/authorize',
  tokenURL: 'https://app.clio.com/oauth/token',
  clientID: process.env.CLIO_CLIENT_ID,
  clientSecret: process.env.CLIO_CLIENT_SECRET,
  callbackURL: process.env.CLIO_REDIRECT_URI,
  passReqToCallback: true, // Enable req in callback
}, async (req, accessToken, refreshToken, params, profile, done) => {
  try {
    console.log('Clio OAuth Callback:', { accessToken, refreshToken, params });
    const user = {
      clio: {
        accessToken,
        refreshToken,
        profile: {}, // Fetch profile from Clio API if needed
      }
    };
    if (req.user) {
      return done(null, mergeUser(req.user, user));
    }
    return done(null, user);
  } catch (error) {
    console.error('Clio OAuth Callback Error:', error);
    return done(error);
  }
}));

// Middleware to check authentication
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated() && req.user.google && req.user.clio) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated or missing Google/Clio connection' });
};

// Routes
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
  accessType: 'offline',
  prompt: 'consent',
}));

app.get('/auth/google/callback', passport.authenticate('google', {
  failureRedirect: `${process.env.FRONTEND_URL}/dashboard?error=google_auth_failed`,
  failureMessage: true,
}), (req, res) => {
  console.log('Google OAuth callback successful:', req.user);
  res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
});

app.get('/auth/clio', passport.authenticate('clio', {
  scope: [], // Add Clio-specific scopes if required
}));

app.get('/auth/clio/callback', (req, res, next) => {
  passport.authenticate('clio', (err, user, info) => {
    if (err) {
      console.error('Clio Callback Authentication Error:', err);
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=clio_auth_failed`);
    }
    if (!user) {
      console.error('Clio Callback: No user returned:', info);
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=clio_auth_failed`);
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Clio Callback Login Error:', loginErr);
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=clio_auth_failed`);
      }
      console.log('Clio OAuth callback successful:', user);
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    });
  })(req, res, next);
});

// User info endpoint
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      google: req.user.google || null,
      clio: req.user.clio || null,
    });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Fetch Gmail emails
app.get('/api/emails', ensureAuthenticated, async (req, res) => {
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: req.user.google.accessToken,
      refresh_token: req.user.google.refreshToken,
    });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const response = await gmail.users.messages.list({ userId: 'me', maxResults: 10 });
    const messages = response.data.messages || [];

    const emails = await Promise.all(messages.map(async msg => {
      const message = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      const headers = message.data.payload.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      const to = headers.find(h => h.name === 'To')?.value || 'Unknown';
      const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
      let body = '';
      if (message.data.payload.parts) {
        const textPart = message.data.payload.parts.find(part => part.mimeType === 'text/plain');
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
      } else if (message.data.payload.body.data) {
        body = Buffer.from(message.data.payload.body.data, 'base64').toString('utf-8');
      }
      return { id: msg.id, subject, to, date, body };
    }));

    res.json(emails);
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Fetch Clio matters
app.get('/api/matters', ensureAuthenticated, async (req, res) => {
  try {
    const response = await axios.get('https://app.clio.com/api/v4/matters', {
      headers: {
        Authorization: `Bearer ${req.user.clio.accessToken}`,
      },
    });
    const matters = response.data.data.map(matter => ({
      id: matter.id,
      clientEmail: matter.client?.email || '',
    }));
    res.json(matters);
  } catch (error) {
    console.error('Error fetching matters:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch matters' });
  }
});

// Summarize email content
app.post('/api/summarize', ensureAuthenticated, async (req, res) => {
  try {
    const { text } = req.body;
    const summary = text.substring(0, 100) + '...'; // Replace with actual summarization
    const duration = 0.5; // Example duration in hours
    res.json({ summary, duration });
  } catch (error) {
    console.error('Error summarizing:', error);
    res.status(500).json({ error: 'Failed to summarize' });
  }
});

// Create Clio time entry
app.post('/api/time-entry', ensureAuthenticated, async (req, res) => {
  try {
    const { matterId, duration, description, date } = req.body;
    const response = await axios.post('https://app.clio.com/api/v4/time_entries', {
      matter: { id: matterId },
      quantity: duration * 3600, // Convert hours to seconds
      description,
      date,
    }, {
      headers: {
        Authorization: `Bearer ${req.user.clio.accessToken}`,
      },
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error creating time entry:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).redirect(`${process.env.FRONTEND_URL}/dashboard?error=server_error`);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});