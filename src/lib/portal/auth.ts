import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

// Constants
export const PORTAL_COOKIE_NAME = "portal_session";
const JWT_SECRET_KEY = process.env.PORTAL_JWT_SECRET || "sfvcyd-portal-responsables-secret-key-2026";
const TOKEN_EXPIRY = "8h";
const SALT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Encode the secret key for jose
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET_KEY);

// --- Password Helpers ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// --- JWT Helpers ---

export interface PortalTokenPayload {
  responsable_id: string;
  username: string;
  nombre_completo: string;
  subsecretarias_ids: string[];
  areas_ids: string[];
  es_secretario?: boolean;
}

export async function createPortalToken(payload: PortalTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecretKey());
}

export async function verifyPortalToken(token: string): Promise<PortalTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as PortalTokenPayload;
  } catch {
    return null;
  }
}

// --- Session Helpers ---

export async function getPortalSession(): Promise<PortalTokenPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyPortalToken(token);
  } catch {
    return null;
  }
}

// --- Lockout Helpers ---

export function isAccountLocked(bloqueado_hasta: string | null): boolean {
  if (!bloqueado_hasta) return false;
  return new Date(bloqueado_hasta) > new Date();
}

export function shouldLockAccount(intentos_fallidos: number): boolean {
  return intentos_fallidos >= MAX_FAILED_ATTEMPTS;
}

export function getLockoutUntil(): string {
  const lockUntil = new Date();
  lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_MINUTES);
  return lockUntil.toISOString();
}

export { MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES };
