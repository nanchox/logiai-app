import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventManage } from "@/components/service/EventManage";
import { FilesPanel } from "@/components/service/FilesPanel";
import { PlanEditor } from "@/components/service/PlanEditor";
import { StatusBadges } from "@/components/service/RotationAdmin";
import { requireUser } from "@/lib/auth";
import { serviceLabel } from "@/lib/labels";
import { loadMembers } from "@/lib/people/load";
import { formatServiceDate } from "@/lib/service/dates";
import { loadEvent, loadPlan, loadPlanPositions, loadRotationGroups } from "@/lib/service/load";
import { canPlanEvent } from "@/lib/service/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Servicio" };

export default async function ServicePage({ params }: PageProps<"/servicio/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();
  const event = /^[0-9a-f-]{36}$/i.test(id) ? await loadEvent(supabase, id) : null;
  if (!event) notFound();

  const canManage = user.isAdmin || user.isHead || user.leaderSites.some((s) => s.id === event.siteId);
  const canPlan = event.status === "programado" && canPlanEvent(user, event);
  const [plan, positions, members, groups] = await Promise.all([
    loadPlan(supabase, event.id),
    loadPlanPositions(supabase, event.siteId, event.day, event.shift),
    event.groupId ? loadMembers(supabase, event.groupId) : Promise.resolve([]),
    canManage ? loadRotationGroups(supabase) : Promise.resolve([]),
  ]);
  const people = members.map((m) => ({ userId: m.userId, name: m.name, role: m.role }));

  return (
    <main className="space-y-6">
      <div>
        <p className="text-sm"><Link href="/servicio">← Mi servicio</Link></p>
        <h1 className="mt-1 text-2xl font-extrabold">{formatServiceDate(event.date)}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
          <span>{serviceLabel(event.day, event.shift)} · {event.siteName} · <strong className="text-fg">{event.groupName ?? "Sin grupo"}</strong></span>
          <StatusBadges e={event} />
        </p>
        {event.note && <p className="mt-2 whitespace-pre-line rounded-lg border border-line bg-surface p-3 text-sm">{event.note}</p>}
      </div>

      {event.status === "cancelado" && (
        <p role="status" className="rounded-2xl border border-danger/60 bg-danger/10 p-4">
          Este servicio está cancelado{event.cancelReason ? `: ${event.cancelReason}` : ""}. Ese turno se pierde y la rotación sigue con el grupo de la semana siguiente.
        </p>
      )}

      {canManage && (
        <EventManage
          event={event}
          groups={groups.filter((g) => g.slotId === event.slotId)}
          hasPlan={plan.status !== null || plan.assignments.length > 0 || plan.files.length > 0}
          canAllSites={user.isAdmin || user.isHead}
        />
      )}

      {event.status === "programado" && event.groupId && (
        <>
          <PlanEditor event={event} positions={positions} people={people} plan={plan} canPlan={canPlan} meId={user.id} />
          <FilesPanel event={event} files={plan.files} canPlan={canPlan} />
        </>
      )}
    </main>
  );
}
