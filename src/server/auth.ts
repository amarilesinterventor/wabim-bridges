/**
 * Autenticación mínima basada en tokens firmados con HMAC-SHA256 (formato
 * similar a JWT pero implementado solo con `node:crypto`, sin dependencias
 * externas, para funcionar sin acceso a internet en este entorno).
 *
 * En la arquitectura objetivo (producción) esto se reemplaza por JWT real
 * (p.ej. librería `jsonwebtoken` o el `@nestjs/jwt` de NestJS) firmado con
 * un secreto gestionado de forma segura (variable de entorno / secret
 * manager) — la forma de los claims (sub, role, exp) es compatible.
 */
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET = process.env.AUTH_SECRET ?? "wabim-dev-secret-change-in-production";
const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 horas

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

interface TokenPayload {
  sub: string; // user id
  email: string;
  role: string;
  name: string;
  exp: number; // epoch seconds
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signToken(payload: Omit<TokenPayload, "exp">): string {
  const full: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const body = base64url(JSON.stringify(full));
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match ? match[1] : null;
}
