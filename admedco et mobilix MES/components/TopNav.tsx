import Link from "next/link";
import { currentUser, homeFor } from "@/lib/auth";
import { logout } from "@/lib/auth-actions";
export default async function TopNav() {
  const user = await currentUser();
  return <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95">
    <nav className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4 text-sm">
      <Link className="font-bold tracking-wide text-slate-100" href={user ? homeFor(user.role) : "/login"}>ADMEDCO &amp; MOBILIX Industrial Systems</Link>
      {user && <div className="ml-auto flex items-center gap-4">
        {user.role === "Administrator" && <><Link href="/">System overview</Link><Link href="/portal/admedco">ADMEDCO</Link><PortalSwitch /></>}
        {user.role !== "Administrator" && <Link href={homeFor(user.role)}>My board</Link>}
        <Link href={user.role === "MOBILIX_Operator" ? "/inventory?division=mobilix" : "/inventory?division=admedco"}>Inventory</Link><Link href="/account" className="text-slate-500 hover:text-slate-300" title="Account settings">{user.email}</Link>
        <form action={logout}><button className="text-amber-300 hover:underline">Sign out</button></form>
      </div>}
    </nav>
  </header>;
}
import PortalSwitch from "./PortalSwitch";


