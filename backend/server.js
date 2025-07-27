require('dotenv').config({ path: '.env' });
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2').Strategy;
const { google } = require('googleapis');
const axios = require('axios');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const app = express();

// Trust proxy for production (e.g., Render)
app.set('trust proxy', 1); // Add this to handle reverse proxy

// Validate environment variables
const requiredEnvVars = [
  'SESSION_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'CLIO_CLIENT_ID',
  'CLIO_CLIENT_SECRET',
  'CLIO_REDIRECT_URI',
  'FRONTEND_URL',
  'MONGODB_URI',
];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} is not defined`);
    process.exit(1);
  }
}

// Log environment variables
console.log('Environment Variables:', {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '[SET]' : '[NOT SET]',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  CLIO_CLIENT_ID: process.env.CLIO_CLIENT_ID ? '[SET]' : '[NOT SET]',
  CLIO_REDIRECT_URI: process.env.CLIO_REDIRECT_URI,
  FRONTEND_URL: process.env.FRONTEND_URL,
  PORT: process.env.PORT || '5000',
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY ? '[SET]' : '[NOT SET]',
  MONGODB_URI: process.env.MONGODB_URI ? '[SET]' : '[NOT SET]',
  NODE_ENV: process.env.NODE_ENV,
});

// Initialize MongoDB and session store
async function initializeApp() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Wait for Mongoose connection
    if (mongoose.connection.readyState !== 1) {
      console.log('Waiting for Mongoose connection...');
      await new Promise((resolve, reject) => {
        mongoose.connection.once('connected', resolve);
        mongoose.connection.once('error', reject);
      });
    }
    console.log('Mongoose connection ready:', mongoose.connection.readyState);

    // Start server after MongoDB connection
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize app:', error.message, error.stack);
    process.exit(1);
  }
}

// Configure CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.options('*', cors()); // Handle preflight requests

// Parse JSON bodies
app.use(express.json());

// Configure session
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: 'sessions',
  connectionOptions: {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    connectTimeoutMS: 30000,
  },
});

sessionStore.on('error', (error) => {
  console.error('MongoDB session store error:', error);
});

sessionStore.on('connected', () => {
  console.log('MongoDB session store connected successfully');
});

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware for session and cookies
app.use((req, res, next) => {
  console.log('Request URL:', req.url);
  console.log('Request Cookies:', req.headers.cookie);
  console.log('Session ID:', req.sessionID);
  console.log('Session:', req.session);
  next();
});

// Passport serialization
passport.serializeUser((user, done) => {
  console.log('Serializing user:', user);
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  console.log('Deserializing user:', obj);
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
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI,
      passReqToCallback: true,
    },
    (req, accessToken, refreshToken, profile, done) => {
      console.log('Google OAuth Callback:', {
        accessToken,
        refreshToken,
        profile: profile ? profile.id : null,
        existingUser: req.user,
      });
      if (!accessToken || !profile) {
        return done(new Error('Invalid credentials or missing profile'));
      }
      const user = { google: { accessToken, refreshToken, profile } };
      req.session.user = user; // Force session modification
      if (req.user) {
        return done(null, mergeUser(req.user, user));
      }
      return done(null, user);
    }
  )
);

// Clio OAuth Strategy
passport.use(
  'clio',
  new OAuth2Strategy(
    {
      authorizationURL: 'https://app.clio.com/oauth/authorize',
      tokenURL: 'https://app.clio.com/oauth/token',
      clientID: process.env.CLIO_CLIENT_ID,
      clientSecret: process.env.CLIO_CLIENT_SECRET,
      callbackURL: process.env.CLIO_REDIRECT_URI,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, params, profile, done) => {
      try {
        console.log('Clio OAuth Callback:', { accessToken, refreshToken });
        const user = { clio: { accessToken, refreshToken, profile: {} } };
        req.session.user = user; // Force session modification
        if (req.user) {
          return done(null, mergeUser(req.user, user));
        }
        return done(null, user);
      } catch (error) {
        console.error('Clio OAuth Callback Error:', error);
        return done(error);
      }
    }
  )
);

// Middleware to check authentication
const ensureAuthenticated = (req, res, next) => {
  console.log('ensureAuthenticated - Session ID:', req.sessionID);
  console.log('ensureAuthenticated - Session:', req.session);
  console.log('ensureAuthenticated - User:', req.user);
  console.log('ensureAuthenticated - isAuthenticated:', req.isAuthenticated());
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

// Routes
app.get(
  '/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
    accessType: 'offline',
    prompt: 'consent',
  })
);

app.get(
  '/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/dashboard?error=google_auth_failed`,
    failureMessage: true,
  }),
  (req, res, next) => {
    console.log('Google OAuth callback - Session ID:', req.sessionID);
    console.log('Google OAuth callback - User:', req.user);
    console.log('Google OAuth callback - Session before save:', req.session);
    req.session.user = req.user; // Force session modification
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=session_save_failed`);
      }
      console.log('Session saved successfully:', req.sessionID);
      console.log('Set-Cookie header:', res.get('Set-Cookie'));
      res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    });
  }
);

app.get('/auth/clio', passport.authenticate('clio', { scope: ['read', 'write'] }));

app.get('/auth/clio/callback', (req, res, next) => {
  passport.authenticate('clio', (err, user, info) => {
    if (err || !user) {
      console.error('Clio Callback Error:', err || info);
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=clio_auth_failed`);
    }
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error('Clio Login Error:', loginErr);
        return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=clio_auth_failed`);
      }
      console.log('Clio OAuth callback - Session ID:', req.sessionID);
      console.log('Clio OAuth callback - User:', user);
      console.log('Clio OAuth callback - Session before save:', req.session);
      req.session.user = user; // Force session modification
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=session_save_failed`);
        }
        console.log('Session saved successfully:', req.sessionID);
        console.log('Set-Cookie header:', res.get('Set-Cookie'));
        res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
      });
    });
  })(req, res, next);
});

// Test session endpoint
app.get('/api/test-session', (req, res) => {
  console.log('Test session - Session ID:', req.sessionID);
  console.log('Test session - Existing session:', req.session);
  req.session.test = 'test-value'; // Force session modification
  req.session.save((err) => {
    if (err) {
      console.error('Test session save error:', err);
      return res.status(500).json({ error: 'Failed to save session' });
    }
    console.log('Test session saved');
    console.log('Test session - Set-Cookie:', res.get('Set-Cookie'));
    res.json({ sessionID: req.sessionID, test: req.session.test });
  });
});

// Check session endpoint
app.get('/api/check-session', (req, res) => {
  console.log('Check session - Session ID:', req.sessionID);
  console.log('Check session - Session:', req.session);
  console.log('Check session - Cookies:', req.headers.cookie);
  res.json({ sessionID: req.sessionID, test: req.session.test || null });
});

// User info endpoint
app.get('/api/user', ensureAuthenticated, (req, res) => {
  res.json({ google: req.user.google || null, clio: req.user.clio || null });
});

// Fetch Gmail emails
app.get('/api/emails', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Fetching emails for user:', req.user.google?.profile?.id);
    console.log('Access Token:', req.user.google?.accessToken);
    console.log('Refresh Token:', req.user.google?.refreshToken ? '[SET]' : '[NOT SET]');

    // Validate user data
    if (!req.user.google || !req.user.google.accessToken) {
      throw new Error('Missing Google access token');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      access_token: req.user.google.accessToken,
      refresh_token: req.user.google.refreshToken,
    });

    // Handle token refresh
    oauth2Client.on('tokens', (tokens) => {
      console.log('Refreshed tokens:', {
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
      });
      if (tokens.access_token) {
        req.user.google.accessToken = tokens.access_token;
        req.session.user = req.user;
        req.session.save((err) => {
          if (err) console.error('Session save error after token refresh:', err);
        });
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Test API connectivity
    const profile = await gmail.users.getProfile({ userId: 'me' });
    console.log('Gmail profile:', profile.data);

    // Fetch sent emails
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:me', // Filter for sent emails
      maxResults: 10, // Limit to 10 emails for performance
    });
    const messages = response.data.messages || [];
    console.log('Fetched messages:', messages.length);

    if (messages.length === 0) {
      console.log('No sent emails found for user:', req.user.google.profile.id);
      return res.json([]); // Return empty array if no emails
    }

    const emails = await Promise.all(
      messages.map(async (msg) => {
        try {
          const message = await gmail.users.messages.get({ userId: 'me', id: msg.id });
          const headers = message.data.payload?.headers || [];
          const subject = headers.find((h) => h.name === 'Subject')?.value || 'No Subject';
          const to = headers.find((h) => h.name === 'To')?.value || 'Unknown';
          const date = headers.find((h) => h.name === 'Date')?.value || new Date().toISOString();
          let body = '';
          if (message.data.payload?.parts) {
            const textPart = message.data.payload.parts.find((part) => part.mimeType === 'text/plain');
            if (textPart && textPart.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            }
          } else if (message.data.payload?.body?.data) {
            body = Buffer.from(message.data.payload.body.data, 'base64').toString('utf-8');
          }
          return { id: msg.id, subject, to, date, body };
        } catch (error) {
          console.error('Error fetching email ID:', msg.id, {
            message: error.message,
            code: error.code,
          });
          return { id: msg.id, subject: 'Error', to: 'Unknown', date: new Date().toISOString(), body: 'Failed to fetch email content' };
        }
      })
    );

    res.json(emails);
  } catch (error) {
    console.error('Error fetching emails:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      response: error.response?.data,
    });
    res.status(500).json({ error: 'Failed to fetch emails', details: error.message });
  }
});

// Fetch Clio matters
app.get('/api/matters', ensureAuthenticated, async (req, res) => {
  try {
    console.log('Fetching matters for user:', req.user.google?.profile?.id);
    console.log('Clio Access Token:', req.user.clio?.accessToken || '[NOT SET]');
    console.log('Clio Refresh Token:', req.user.clio?.refreshToken ? '[SET]' : '[NOT SET]');
    console.log('Timestamp:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

    if (!req.user.clio || !req.user.clio.accessToken) {
      throw new Error('Missing Clio access token');
    }

    const endpoint = 'https://app.clio.com/api/v4/matters.json';
    const mattersResponse = await axios.get(endpoint, {
      headers: { Authorization: `Bearer ${req.user.clio.accessToken}` },
      params: {
        fields: 'id,display_number,description,client{id,name}',
        query: '00001-Wide' // Filter for Think Wide matter
      }
    });

    console.log('Clio matters response:', {
      status: mattersResponse.status,
      data: mattersResponse.data.data,
      dataCount: mattersResponse.data.data?.length || 0,
      meta: mattersResponse.data.meta,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    });

    const matters = await Promise.all(
      mattersResponse.data.data.map(async (matter) => {
        let clientEmail = '';
        if (matter.client?.id) {
          try {
            const contactResponse = await axios.get(`https://app.clio.com/api/v4/contacts/${matter.client.id}.json`, {
              headers: { Authorization: `Bearer ${req.user.clio.accessToken}` },
              params: { fields: 'email' }
            });
            console.log(contactResponse);
            clientEmail = contactResponse.data.data.email || '';
          } catch (contactError) {
            console.error('Error fetching contact email:', {
              message: contactError.message,
              code: contactError.code,
              response: contactError.response?.data,
              timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
            });
          }
        }
        return {
          id: matter.id,
          displayNumber: matter.display_number,
          description: matter.description || '',
          clientId: matter.client?.id || '',
          clientName: matter.client?.name || '',
          clientEmail:matter.client?.primary_email_address || ''
        };
      })
    );

    res.json(matters);
  } catch (error) {
    console.error('Error fetching matters:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    });
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch matters',
      details: error.response?.data?.error || error.message
    });
  }
});
// Summarize email
app.post('/api/summarize', ensureAuthenticated, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });
    if (!process.env.HUGGINGFACE_API_KEY) {
      return res.status(500).json({ error: 'Hugging Face API key is not configured' });
    }
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/facebook/bart-large-cnn',
      { inputs: text, parameters: { max_length: 100, min_length: 30, do_sample: false } },
      { headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    const summary = response.data[0]?.summary_text || 'Summary not generated.';
    const duration = summary.length / 1000 + 0.5;
    res.json({ summary, duration });
  } catch (error) {
    console.error('Error summarizing:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to summarize' });
  }
});

// Create Clio time entry
app.post('/api/time-entry', ensureAuthenticated, async (req, res) => {
  try {
    const { matterId, duration, description, date } = req.body;
    const response = await axios.post(
      'https://app.clio.com/api/v4/time_entries',
      { matter: { id: matterId }, quantity: duration * 3600, description, date },
      { headers: { Authorization: `Bearer ${req.user.clio.accessToken}` } }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error creating time entry:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// Fetch Clio time entries
app.get('/api/time-entries', ensureAuthenticated, async (req, res) => {
  try {
    const response = await axios.get('https://app.clio.com/api/v4/time_entries', {
      headers: { Authorization: `Bearer ${req.user.clio.accessToken}` },
    });
    const timeEntries = response.data.data.map((entry) => ({
      id: entry.id,
      description: entry.description,
      date: entry.date,
      duration: entry.quantity / 3600,
      matterId: entry.matter?.id,
    }));
    res.json(timeEntries);
  } catch (error) {
    console.error('Error fetching time entries:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    mongodbConnected: mongoose.connection.readyState === 1,
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Server error' });
});

// Prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.stack);
});

// Start server
initializeApp();