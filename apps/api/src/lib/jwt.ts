import jwt from 'jsonwebtoken';
import type { UserRole } from '@stap/shared';

const ACCESS_SECRET = process.env.JWT_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  name: string;
  email: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(userId: string): string {
  const payload: RefreshTokenPayload = {
    sub: userId,
    type: 'refresh',
    jti: crypto.randomUUID(),
  };
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;
}
