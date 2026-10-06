/**
 * Password-change rules.
 *
 * Kept as pure functions, separate from the server action that applies them, so
 * the rule set can be unit-tested without a database, a session or a request.
 * The action and the browser form both read these; the server stays authoritative.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

export interface PasswordChangeInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Check a password change against the rule set.
 *
 * Returns a map of field name to message; an empty map means the change is
 * acceptable. The caller separately verifies `currentPassword` against the
 * stored hash — that needs the database and is not this function's job.
 */
export function validatePasswordChange(input: PasswordChangeInput): Record<string, string> {
  const { currentPassword, newPassword, confirmPassword } = input;
  const errors: Record<string, string> = {};

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (newPassword.length > PASSWORD_MAX_LENGTH) {
    errors.newPassword = "That password is too long.";
  } else if ([...newPassword].every((character) => character === newPassword[0])) {
    errors.newPassword = "Choose a password with more variety.";
  }

  if (confirmPassword !== newPassword) {
    errors.confirmPassword = "The two passwords do not match.";
  }

  if (newPassword !== "" && newPassword === currentPassword) {
    errors.newPassword = "The new password must differ from the current one.";
  }

  return errors;
}
