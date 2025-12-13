import express, { Request, Response, Router } from 'express';

const router: Router = express.Router();

const AUTH0_DOMAIN = 'dev-b2tyy2ginewj0x16.us.auth0.com';
const AUTH0_NATIVE_CLIENT_ID = 'xJ9GgWFijIa6WMXXnfD5a9CvXzuV4JxR';

// Proxy endpoint to verify SMS OTP and get Auth0 token
// This avoids CORS issues since the request is made from backend
router.post('/verify-sms', async (req: Request, res: Response): Promise<void> => {
  const { phone_number, otp } = req.body;

  if (!phone_number || !otp) {
    res.status(400).json({ error: 'phone_number and otp are required' });
    return;
  }

  try {
    const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'http://auth0.com/oauth/grant-type/passwordless/otp',
        client_id: AUTH0_NATIVE_CLIENT_ID,
        realm: 'sms',
        username: phone_number,
        otp: otp,
        audience: 'https://api.convoe.ai',
        scope: 'openid profile email offline_access'
      }),
    });

    const data = await response.json();

    if (response.ok && data.access_token) {
      console.log('✅ SMS verification successful for:', phone_number);
      res.status(200).json({
        success: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token, // Include refresh token for persistent sessions
        token_type: data.token_type,
        expires_in: data.expires_in
      });
    } else {
      console.error('❌ SMS verification failed:', data);
      res.status(401).json({
        success: false,
        error: data.error || 'verification_failed',
        message: data.error_description || 'Invalid verification code'
      });
    }
  } catch (error: any) {
    console.error('Error verifying SMS:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to verify SMS code'
    });
  }
});

// Refresh token endpoint - exchanges refresh token for new access token
router.post('/refresh-token', async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    res.status(400).json({ error: 'refresh_token is required' });
    return;
  }

  try {
    const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: AUTH0_NATIVE_CLIENT_ID,
        refresh_token: refresh_token
      }),
    });

    const data = await response.json();

    if (response.ok && data.access_token) {
      console.log('✅ Token refresh successful');
      res.status(200).json({
        success: true,
        access_token: data.access_token,
        refresh_token: data.refresh_token || refresh_token, // Auth0 may return new refresh token
        token_type: data.token_type,
        expires_in: data.expires_in
      });
    } else {
      console.error('❌ Token refresh failed:', data);
      res.status(401).json({
        success: false,
        error: data.error || 'refresh_failed',
        message: data.error_description || 'Failed to refresh token'
      });
    }
  } catch (error: any) {
    console.error('Error refreshing token:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to refresh token'
    });
  }
});

export default router;
