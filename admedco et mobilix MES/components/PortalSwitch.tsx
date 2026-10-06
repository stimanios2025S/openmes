"use client";
import { useRouter } from "next/navigation";
export default function PortalSwitch() {
  const router = useRouter();
  return <select aria-label="Switch division" className="rounded border border-slate-700 bg-slate-900 p-1" defaultValue="" onChange={(event) => router.push(event.target.value)}>
    <option value="" disabled>Switch division</option>
    <option value="/portal/admedco">ADMEDCO</option>
    <option value="/portal/mobilix">MOBILIX</option>
  </select>;
}
