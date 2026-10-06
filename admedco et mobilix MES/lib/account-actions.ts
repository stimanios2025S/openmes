"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { currentUser } from "./auth";
import { prisma } from "./db";
import { passwordHash, verifyPassword } from "./password";
import { validatePasswordChange } from "./password-policy";
import type { FormState } from "./forms";

const COOKIE = "mes_session";

/**
 * Change the signed-in user's own password.
 *
 * The current password is required as proof of possession: a stolen session
 * cookie alone must not be enough to let an attacker lock the owner out. Every
 * other session for the account is destroyed on success, so a device that was
 * left signed in stops working; the session making this change stays alive.
 */
export async function changePassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await currentUser();
  if (!user) {
    return { status: "error", message: "Your session has expired. Sign in again.", errors: {} };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const errors = validatePasswordChange({ currentPassword, newPassword, confirmPassword });

  // The rule set above cannot see the stored hash, so the proof-of-possession
  // check lives here, where the database is.
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    errors.currentPassword = "That is not your current password.";
  }

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Your password was not changed.", errors };
  }

  // Identify the caller's own session so it can be spared when the rest are cut.
  const token = (await cookies()).get(COOKIE)?.value;
  const keepId = token
    ? (await prisma.session.findUnique({
        where: { tokenHash: createHash("sha256").update(token).digest("hex") },
        select: { id: true },
      }))?.id ?? null
    : null;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: passwordHash(newPassword) },
    }),
    prisma.session.deleteMany({
      where: keepId ? { userId: user.id, NOT: { id: keepId } } : { userId: user.id },
    }),
  ]);

  revalidatePath("/account");

  return {
    status: "ok",
    message: "Password changed. Other signed-in devices have been signed out.",
    errors: {},
  };
}
