import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { AccessTokenPayload } from './jwt.js';

export interface ChatDelegation extends AccessTokenPayload, JwtPayload {
  actor: 'chatbot';
}

export function createChatDelegation(user: AccessTokenPayload, secret: string): string {
  if (!secret || secret.length < 32) throw new Error('CHAT_DELEGATION_SECRET must have at least 32 characters');
  return jwt.sign({ ...user, actor: 'chatbot' }, secret, {
    algorithm: 'HS256', expiresIn: 300, issuer: 'ady-api', audience: ['ady-chat', 'ady-api'],
  });
}

export function verifyChatDelegation(token: string, secret: string): ChatDelegation {
  if (!secret || secret.length < 32) throw new Error('Invalid delegation secret');
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'ady-api', audience: 'ady-api' });
  if (typeof payload === 'string' || payload.actor !== 'chatbot' ||
      !['userId', 'tenantId', 'email', 'role'].every(key => typeof payload[key] === 'string' && payload[key].length > 0) ||
      typeof payload.iat !== 'number' || typeof payload.exp !== 'number' ||
      payload.exp <= payload.iat || payload.exp - payload.iat > 300 || payload.iat > Math.floor(Date.now() / 1000) + 30) {
    throw new Error('Invalid delegation claims');
  }
  return payload as ChatDelegation;
}

export function isChatToolPath(path: string): boolean {
  if (path.includes('%') || path.includes('\\') || path.split('/').some(segment => segment === '.' || segment === '..')) return false;
  if (/^\/api\/campaigns\/chat-account\/act_\d{1,32}\/?$/.test(path)) return true;
  if (/^\/api\/studio\/video\/options\/?$/.test(path)) return true;
  if (/^\/api\/brand-kit\/chat-library\/?$/.test(path)) return true;
  if (/^\/api\/campaigns\/[a-zA-Z0-9-]+\/chat-ads\/\d{1,32}\/?$/.test(path)) return true;
  if (/^\/api\/campaigns\/[a-zA-Z0-9-]+\/chat-ads-create(?:\/snapshot)?\/?$/.test(path)) return true;
  if (/^\/api\/campaigns\/[a-zA-Z0-9-]+\/chat-ad-assets\/?$/.test(path)) return true;
  if (/^\/api\/campaigns\/[a-zA-Z0-9-]+\/chat-available-ad-assets\/?$/.test(path)) return true;
  if (/^\/api\/auth\/me\/chat-(?:snapshot|update)\/?$/.test(path)) return true;
  return /^\/api\/(brand-kit(?:\/chat-(?:snapshot|update))?|studio\/assets(?:\/[a-zA-Z0-9-]+)?|studio\/ai\/(?:generate-image|generate-video|regenerate|chat-edit|assets\/[a-zA-Z0-9-]+\/chat-snapshot)|studio\/video\/(jobs(?:\/[a-zA-Z0-9-]+)?|assets\/[a-zA-Z0-9-]+\/(?:adjust|chat-adjust))|planner\/(calendar|posts(?:\/[a-zA-Z0-9-]+(?:\/(?:move|chat-snapshot|chat-cancel))?)?)|campaigns(?:\/create|\/create-wizard|\/[a-zA-Z0-9-]+(?:\/(?:pause|status|budget|chat-ads|chat-snapshot|chat-update))?)?)\/?$/.test(path);
}
