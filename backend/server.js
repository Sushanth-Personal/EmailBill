require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OAuth2Strategy = require('passport-oauth2').Strategy;

const app = express();

// Log environment variables for debugging
console.log('Environment Variables:', {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
  CLIO_REDIRECT_URI: process.env.CLIO_REDIRECT_URI || 'http://localhost:3000/auth/clio/callback',
  FRONTEND_URL: process.env.FRONTEND_URL,
  PORT: process.env.PORT,
});

// Configure CORS
app.use(cors({
  origin: process.env.FRONTEND_URL, // http://localhost:5173
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
}, (accessToken, refreshToken, profile, done) => {
  console.log('Clio OAuth Callback:', { accessToken, refreshToken });
  const user = {
    clio: {
      accessToken,
      refreshToken,
      profile: {},
    }
  };
  if (req.user) {
    return done(null, mergeUser(req.user, user));
  }
  return done(null, user);
}));

// Routes
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
  accessType: 'offline',
  prompt: 'consent',
}));

app.get('/auth/google/callback', passport.authenticate('google', {
  failureRedirect: `${process.env.FRONTEND_URL}/dashboard?error=authentication_failed`,
  failureMessage: true,
}), (req, res) => {
  console.log('Google OAuth callback successful:', req.user);
  res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
});

app.get('/auth/clio', passport.authenticate('clio', {
  scope: [], // Add Clio-specific scopes if required
}));

app.get('/auth/clio/callback', passport.authenticate('clio', {
  failureRedirect: `${process.env.FRONTEND_URL}/dashboard?error=authentication_failed`,
}), (req, res) => {
  console.log('Clio OAuth callback successful:', req.user);
  res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});