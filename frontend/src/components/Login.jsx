import React from 'react';
import { Button, Container, Typography } from '@mui/material';

function Login() {
  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:3000/auth/google';
  };

  const handleClioLogin = () => {
    window.location.href = 'https://localhost:3000/auth/clio';
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
        color="info"
        onClick={handleClioLogin}
        style={{ margin: '10px' }}
      >
        Login with Clio
      </Button>
    </Container>
  );
}

export default Login;