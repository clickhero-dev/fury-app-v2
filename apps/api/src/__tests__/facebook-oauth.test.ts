import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { appsecretProof, getFacebookOAuthConfig } from '../lib/facebook-oauth.js';

describe('facebook-oauth', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('appsecretProof = HMAC-SHA256(token, appSecret) em hex', () => {
    const expected = crypto.createHmac('sha256', 'sek').update('tok').digest('hex');
    expect(appsecretProof('tok', 'sek')).toBe(expected);
  });

  it('getFacebookOAuthConfig usa FACEBOOK_* quando presente', () => {
    process.env.FACEBOOK_APP_ID = 'fb-id';
    process.env.FACEBOOK_APP_SECRET = 'fb-sec';
    process.env.META_APP_ID = 'm-id';
    process.env.META_APP_SECRET = 'm-sec';
    expect(getFacebookOAuthConfig()).toEqual({ appId: 'fb-id', appSecret: 'fb-sec' });
  });

  it('cai para META_* quando FACEBOOK_* ausente', () => {
    process.env.META_APP_ID = 'm-id';
    process.env.META_APP_SECRET = 'm-sec';
    expect(getFacebookOAuthConfig()).toEqual({ appId: 'm-id', appSecret: 'm-sec' });
  });

  it('lança MISSING_ENV quando nada está configurado', () => {
    expect(() => getFacebookOAuthConfig()).toThrow(/FACEBOOK_APP_ID/);
  });
});
