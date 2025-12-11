import { auth } from 'express-oauth2-jwt-bearer';

// Auth0 JWT validation configuration
export const auth0Config = {
  audience: process.env.AUTH0_AUDIENCE || 'https://api.convoe.ai',
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL || 'https://dev-b2tyy2ginewj0x16.us.auth0.com',
  tokenSigningAlg: 'RS256' as const,
};

// JWT validation middleware using express-oauth2-jwt-bearer
export const checkJwt = auth({
  audience: auth0Config.audience,
  issuerBaseURL: auth0Config.issuerBaseURL,
  tokenSigningAlg: auth0Config.tokenSigningAlg,
});
