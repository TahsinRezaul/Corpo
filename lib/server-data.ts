import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data", "userdata");

function userFile(userId: string): string {
  return join(DATA_DIR, `${userId}.json`);
}

export function loadUserData(userId: string): Record<string, unknown> {
  const file = userFile(userId);
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, "utf-8")); } catch { return {}; }
}

export function setUserKey(userId: string, key: string, value: unknown): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const data = loadUserData(userId);
  data[key] = value;
  writeFileSync(userFile(userId), JSON.stringify(data));
}

export function clearUserData(userId: string): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(userFile(userId), "{}");
}
