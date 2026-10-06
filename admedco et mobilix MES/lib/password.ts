import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export function passwordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex || hex.length !== 128) return false;
  const expected = Buffer.from(hex, "hex");
  return timingSafeEqual(scryptSync(password, salt, expected.length), expected);
}
