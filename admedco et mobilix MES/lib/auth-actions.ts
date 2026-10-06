"use server";
import { redirect } from "next/navigation";
import { verifyPassword } from "./password";
import { prisma } from "./db";
import { endSession, homeFor, startSession } from "./auth";

export async function login(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) redirect("/login?error=1");
  await startSession(user.id);
  redirect(homeFor(user.role));
}

export async function logout() {
  await endSession();
  redirect("/login");
}

