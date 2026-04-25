import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const DATA_DIR   = join(process.cwd(), "data");
const USERS_FILE = join(DATA_DIR, "users.json");

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  salt?: string;
  createdAt: string;
};

function loadUsers(): StoredUser[] {
  if (!existsSync(USERS_FILE)) return [];
  try { return JSON.parse(readFileSync(USERS_FILE, "utf-8")); } catch { return []; }
}

function saveUsers(users: StoredUser[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt + (process.env.AUTH_SECRET ?? ""), 100_000, 64, "sha512").toString("hex");
}

export function findByEmail(email: string): StoredUser | null {
  return loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function verifyPassword(user: StoredUser, password: string): boolean {
  if (!user.passwordHash || !user.salt) return false;
  const actual   = Buffer.from(hashPassword(password, user.salt));
  const expected = Buffer.from(user.passwordHash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function upsertOAuthUser(email: string, name: string): StoredUser {
  const norm = email.toLowerCase().trim();
  const existing = findByEmail(norm);
  if (existing) return existing;
  const user: StoredUser = {
    id: randomBytes(8).toString("hex"),
    email: norm,
    name: (name || norm).trim(),
    createdAt: new Date().toISOString(),
  };
  const users = loadUsers();
  users.push(user);
  saveUsers(users);
  return user;
}

export function createUser(email: string, name: string, password: string): StoredUser {
  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: randomBytes(8).toString("hex"),
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString(),
  };
  const users = loadUsers();
  users.push(user);
  saveUsers(users);
  return user;
}
