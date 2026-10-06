/**
 * Shapes shared between the server actions and the client forms that call them.
 *
 * These live outside `lib/actions.ts` on purpose: a module marked `"use server"`
 * may only export async functions, so the initial state constant and the result
 * interfaces cannot live there.
 */

export interface FormState {
  status: "idle" | "ok" | "error";
  message: string;
  errors: Record<string, string>;
}

export const EMPTY_FORM_STATE: FormState = {
  status: "idle",
  message: "",
  errors: {},
};

export interface StageResult {
  ok: boolean;
  message: string;
}
