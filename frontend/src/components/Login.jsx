import React from 'react';
import { Button, Container, Typography } from '@mui/material';

function Login() {
  const handleGoogleLogin = () => {
    // Placeholder for Google OAuth redirect (implemented in Step 2)
    alert('Google Login will be implemented');
  };

  const handlePracticePantherLogin = () => {
    // Placeholder for PracticePanther OAuth redirect
    alert('PracticePanther Login will be implemented');
  };

  return (
    <Container maxWidth="sm" style={{ textAlign: 'center', marginTop: '50px' }}>
      <Typography variant="h4" gutterBottom>
        EmailBill - Login
      </Typography>
      <Button
        variant="contained"
        color="primary"
        onClick={handleGoogleLogin}
        style={{ margin: '10px' }}
      >
        Login with Google
      </Button>
      <Button
        variant="contained"
        color="secondary"
        onClick={handlePracticePantherLogin}
        style={{ margin: '10px' }}
      >
        Login with PracticePanther
      </Button>
    </Container>
  );
}

export default Login;
