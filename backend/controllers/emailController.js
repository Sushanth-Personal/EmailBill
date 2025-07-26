const { google } = require('googleapis');
const axios = require('axios');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

exports.getEmails = async (req, res) => {
  if (!req.session.googleTokens) {
    return res.status(401).send('Not authenticated with Google');
  }
  try {
    oauth2Client.setCredentials(req.session.googleTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      q: 'from:me',
    });
    const messages = response.data.messages || [];
    const emails = await Promise.all(
      messages.map(async (message) => {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
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
};

exports.summarizeEmail = async (req, res) => {
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
};