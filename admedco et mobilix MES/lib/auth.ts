import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

const COOKIE = "mes_session";
const lifetime = 60 * 60 * 24 * 7;
export type Role = "Administrator" | "ADMEDCO_Operator" | "MOBILIX_Operator";

function digest(token: string) { return createHash("sha256").update(token).digest("hex"); }

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export function homeFor(role: string) {
  return role === "Administrator" ? "/portal/admedco" : role === "ADMEDCO_Operator" ? "/portal/admedco" : "/portal/mobilix";
}

export async function requireDivision(division: "ADMEDCO" | "MOBILIX") {
  const user = await requireUser();
  if (user.role !== "Administrator" && user.role !== `${division}_Operator`) redirect(homeFor(user.role));
  return user;
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({ data: { tokenHash: digest(token), userId, expiresAt: new Date(Date.now() + lifetime * 1000) } });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: lifetime });
}

export async function endSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: digest(token) } });
  (await cookies()).delete(COOKIE);
}



