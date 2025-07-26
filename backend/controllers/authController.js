const { google } = require('googleapis');
const axios = require('axios');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const CLIO_AUTH_URL = 'https://app.clio.com/oauth/authorize';
const CLIO_TOKEN_URL = 'https://app.clio.com/oauth/token';

exports.googleAuth = (req, res) => {
  console.log('Reached /auth/google endpoint');
  console.log(process.env.GOOGLE_CLIENT_ID)
  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/gmail.readonly'],
      prompt: 'consent',
      
    });
    console.log('Redirecting to Google OAuth:', url);
    res.redirect(url);
  } catch (error) {
    console.error('Error generating Google OAuth URL:', error);
    res.status(500).send('Failed to generate Google OAuth URL');
  }
};

exports.googleCallback = async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    req.session.googleTokens = tokens;
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    res.status(500).send('Google authentication failed');
  }
};

exports.clioAuth = (req, res) => {
  if (!process.env.CLIO_CLIENT_ID || !process.env.CLIO_REDIRECT_URI) {
    return res.status(503).send('Clio credentials not configured');
  }
  const state = Math.random().toString(36).substring(2);
  req.session.oauthState = state;
  const url = `${CLIO_AUTH_URL}?response_type=code&client_id=${process.env.CLIO_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.CLIO_REDIRECT_URI)}&state=${state}`;
  res.redirect(url);
};

exports.clioCallback = async (req, res) => {
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
      grant_type: 'authorization_code',
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    req.session.clioTokens = response.data;
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.error('Error in Clio OAuth callback:', error.response?.data || error);
    res.status(500).send('Clio authentication failed');
  }
};