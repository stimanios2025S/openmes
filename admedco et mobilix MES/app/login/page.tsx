import { redirect } from "next/navigation";
import { currentUser, homeFor } from "@/lib/auth";
import { login } from "@/lib/auth-actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  if (user) redirect(homeFor(user.role));
  const { error } = await searchParams;
  return <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
    <h1 className="text-2xl font-bold">ADMEDCO &amp; MOBILIX Operations Portal</h1>
    <p className="mt-2 text-sm text-slate-400">Sign in to your production division.</p>
    {error && <p role="alert" className="mt-4 text-sm text-rose-300">Invalid email or password.</p>}
    <form action={login} className="mt-6 space-y-4">
      <label className="block text-sm">Email<input required name="email" type="email" autoComplete="username" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2" /></label>
      <label className="block text-sm">Password<input required name="password" type="password" autoComplete="current-password" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2" /></label>
      <button className="w-full rounded bg-amber-500 p-2 font-semibold text-slate-950">Sign in</button>
    </form>
  </div>;
}
