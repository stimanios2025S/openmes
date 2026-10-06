import assert from "node:assert/strict";
import { test } from "node:test";

import { PASSWORD_MIN_LENGTH, validatePasswordChange } from "../lib/password-policy";

const ok = "a-perfectly-fine-passphrase";

test("a well-formed change passes", () => {
  assert.deepEqual(
    validatePasswordChange({ currentPassword: "old-one", newPassword: ok, confirmPassword: ok }),
    {},
  );
});

test("a new password shorter than the minimum is rejected", () => {
  const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
  const errors = validatePasswordChange({ currentPassword: "old-one", newPassword: short, confirmPassword: short });
  assert.ok(errors.newPassword, "expected a minimum-length error");
});

test("confirm must match the new password", () => {
  const errors = validatePasswordChange({ currentPassword: "old-one", newPassword: ok, confirmPassword: `${ok}!` });
  assert.ok(errors.confirmPassword);
});

test("the new password must differ from the current one", () => {
  const errors = validatePasswordChange({ currentPassword: ok, newPassword: ok, confirmPassword: ok });
  assert.ok(errors.newPassword);
});

test("a single repeated character is rejected even at full length", () => {
  const flat = "z".repeat(PASSWORD_MIN_LENGTH + 4);
  const errors = validatePasswordChange({ currentPassword: "old-one", newPassword: flat, confirmPassword: flat });
  assert.ok(errors.newPassword);
});

test("an over-long password is rejected", () => {
  const huge = "x".repeat(201);
  const errors = validatePasswordChange({ currentPassword: "old-one", newPassword: huge, confirmPassword: huge });
  assert.ok(errors.newPassword);
});
