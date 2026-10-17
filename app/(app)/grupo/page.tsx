import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { loadMembers } from "@/lib/people/load";
import { ROLE_LABEL, ROLE_PLURAL } from "@/lib/people/labels";
import { ROLES } from "@/lib/people/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mi grupo" };

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

export default async function MyGroupPage() {
  const user = await requireUser();
  if (!user.membership) redirect(user.canManagePeople ? "/personas" : "/");
  const m = user.membership;

  const supabase = await createClient();
  const [{ data: slot }, members] = await Promise.all([
    supabase.from("groups").select("service_slots(day, shift, arrival_time, start_time, end_time)").eq("id", m.groupId).maybeSingle(),
    loadMembers(supabase, m.groupId),
  ]);
  const s = (slot as unknown as { service_slots: { arrival_time: string | null; start_time: string | null; end_time: string | null } } | null)?.service_slots;
  const times = [["Llegada", hhmm(s?.arrival_time ?? null)], ["Inicio", hhmm(s?.start_time ?? null)], ["Fin", hhmm(s?.end_time ?? null)]].filter(([, t]) => t);

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">{m.groupName}</h1>
        <p className="mt-1 text-muted">{m.service} · {m.site.name}{times.length > 0 && ` · ${times.map(([l, t]) => `${l} ${t}`).join(" · ")}`}</p>
        {user.canManagePeople && <p className="mt-2 text-sm"><Link href="/personas">Administrar personas</Link></p>}
      </div>

      {ROLES.map((role) => {
        const list = members.filter((x) => x.role === role);
        if (!list.length) return null;
        return (
          <section key={role} aria-label={ROLE_PLURAL[role]}>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">{ROLE_PLURAL[role]} ({list.length})</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <li key={p.userId} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                  <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black ${role === "coordinador" ? "bg-bronze text-on-bronze" : "bg-bg"}`}>{initials(p.name)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}{p.userId === user.id && <span className="ml-2 text-xs text-muted">(tú)</span>}</span>
                    <span className="block text-xs text-muted">{ROLE_LABEL[role]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-muted">Por privacidad, en esta lista solo se ven los nombres.</p>
    </main>
  );
}
