import type { Metadata } from "next";

import AccountForm from "@/components/AccountForm";
import { Card, CardHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account — ADMEDCO & MOBILIX" };

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100">Account</h1>
        <p className="mt-1 text-sm text-slate-400">
          Signed in as <span className="text-slate-200">{user.email}</span> ·{" "}
          <span className="font-mono text-xs">{user.role}</span>
        </p>
      </header>

      <Card>
        <CardHeader
          title="Change password"
          subtitle="The demo accounts share a known password — set your own before exposing this app."
        />
        <AccountForm />
      </Card>
    </div>
  );
}
