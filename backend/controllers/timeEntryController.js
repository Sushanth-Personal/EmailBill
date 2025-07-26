const axios = require('axios');

exports.getMatters = async (req, res) => {
  if (!req.session.clioTokens) {
    return res.status(401).send('Not authenticated with Clio');
  }
  try {
    const response = await axios.get('https://app.clio.com/api/v4/matters', {
      headers: { Authorization: `Bearer ${req.session.clioTokens.access_token}` },
    });
    const matters = response.data.data.map(matter => ({
      id: matter.id,
      display_name: matter.description,
      clientEmail: matter.client?.email || '',
    }));
    res.json(matters);
  } catch (error) {
    console.error('Error fetching Clio matters:', error.response?.data || error);
    res.status(500).send('Failed to fetch matters');
  }
};

exports.createTimeEntry = async (req, res) => {
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
        description,
        date: date.split('T')[0], // YYYY-MM-DD
        type: 'TimeEntry',
      },
      {
        headers: { Authorization: `Bearer ${req.session.clioTokens.access_token}` },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error creating Clio time entry:', error.response?.data || error);
    res.status(500).send('Failed to create time entry');
  }
};