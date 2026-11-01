import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/lib/auth";
import { loadMySupportEvents } from "@/lib/support/load";
import { type ActiveItem, activeServices } from "./active";
import { addDays } from "./dates";
import { loadEvents } from "./load";

/** Quien acompaña a los grupos (administrador, cabeza, líder de sede) en vez de pertenecer a uno. */
export const isStaff = (u: Pick<CurrentUser, "isAdmin" | "isHead" | "leaderSites">) => u.isAdmin || u.isHead || u.leaderSites.length > 0;

/** Servicios activos de la persona: los de hoy y el siguiente (de su grupo, de su alcance y aquellos en los que apoya). */
export async function loadActiveServices(supabase: SupabaseClient, user: CurrentUser, today: string): Promise<ActiveItem[]> {
  const staff = isStaff(user);
  const groupId = user.membership?.groupId ?? null;
  const [events, supports] = await Promise.all([
    loadEvents(supabase, { from: today, until: addDays(today, 60), limit: 200, ...(!staff && groupId ? { groupId } : {}) }),
    loadMySupportEvents(supabase),
  ]);
  return activeServices({ events, supports, today, groupId, staff });
}
