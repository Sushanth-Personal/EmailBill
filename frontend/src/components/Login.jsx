import React from 'react';
import { Button, Container, Typography } from '@mui/material';

function Login() {
  const backendUrl = process.VITE_API_BASE_URL || 'http://localhost:3000';
  const handleGoogleLogin = () => {
    window.location.href = `${backendUrl}/auth/google`;
  };

  const handleClioLogin = () => {
    window.location.href = `${backendUrl}/auth/clio`;
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