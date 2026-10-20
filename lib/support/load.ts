import type { SupabaseClient } from "@supabase/supabase-js";
import type { Application, Candidate, EventPerson, EventRequest, OpenRequest, OutgoingSupport, SupportEvent } from "./types";

type Rows<T> = { data: T[] | null };

/** Solicitudes de apoyo que la persona puede atender o a las que se postuló. Sin la migración, devuelve vacío. */
export async function loadOpenRequests(supabase: SupabaseClient): Promise<OpenRequest[]> {
  const { data } = (await supabase.rpc("open_support_requests")) as Rows<Record<string, unknown>>;
  return (data ?? []).map((r) => ({
    requestId: r.request_id as string, date: r.service_date as string, siteName: r.site_name as string, day: r.day as string, shift: r.shift as string,
    startTime: (r.start_time as string | null) ?? null, groupName: r.group_name as string, needed: r.needed as number, filled: r.filled as number,
    note: (r.note as string | null) ?? null, positions: (r.position_names as string[]) ?? [], myStatus: (r.my_status as OpenRequest["myStatus"]) ?? null,
    applicationId: (r.application_id as string | null) ?? null,
  }));
}

export async function loadEventPeople(supabase: SupabaseClient, eventId: string): Promise<EventPerson[]> {
  const { data } = (await supabase.rpc("event_people", { p_event: eventId })) as Rows<Record<string, unknown>>;
  return (data ?? []).map((p) => ({
    userId: p.user_id as string, name: p.full_name as string, role: p.role as EventPerson["role"], origin: p.origin as EventPerson["origin"],
    groupName: p.group_name as string, absent: !!p.absent,
  }));
}

export async function loadCandidates(supabase: SupabaseClient, eventId: string, query: string): Promise<Candidate[]> {
  const { data, error } = (await supabase.rpc("support_candidates", { p_event: eventId, p_query: query })) as Rows<Record<string, unknown>> & { error: { message: string } | null };
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ userId: c.user_id as string, name: c.full_name as string, groupName: c.group_name as string, role: c.role as string }));
}

/** Solicitud abierta del servicio (la ven quienes lo planifican), con cuántos faltan y qué posiciones se pidieron. */
export async function loadEventRequest(supabase: SupabaseClient, eventId: string): Promise<EventRequest | null> {
  const { data: r } = await supabase.from("support_requests").select("id, needed, note").eq("event_id", eventId).eq("status", "abierta").maybeSingle();
  if (!r) return null;
  const [filled, positions] = await Promise.all([
    supabase.rpc("support_filled", { p_request: r.id }),
    supabase.from("support_request_positions").select("position_id").eq("request_id", r.id),
  ]);
  return { id: r.id, needed: r.needed, filled: (filled.data as number | null) ?? 0, note: r.note, positionIds: (positions.data ?? []).map((p) => p.position_id) };
}

export async function loadApplications(supabase: SupabaseClient, requestId: string): Promise<Application[]> {
  const { data } = (await supabase.rpc("request_applications", { p_request: requestId })) as Rows<Record<string, unknown>>;
  return (data ?? []).map((a) => ({
    id: a.id as string, userId: a.user_id as string, name: a.full_name as string, groupName: (a.group_name as string | null) ?? "", role: a.role as string,
    status: a.status as Application["status"], createdAt: a.created_at as string,
  }));
}

export async function loadMySupportEvents(supabase: SupabaseClient): Promise<SupportEvent[]> {
  const { data } = (await supabase.rpc("my_support_events")) as Rows<Record<string, unknown>>;
  return (data ?? []).map((e) => ({
    eventId: e.event_id as string, date: e.service_date as string, siteName: e.site_name as string, day: e.day as string, shift: e.shift as string,
    groupName: (e.group_name as string | null) ?? null, source: e.source as SupportEvent["source"], status: e.status as string,
  }));
}

export async function loadOutgoingSupports(supabase: SupabaseClient, groupId: string): Promise<OutgoingSupport[]> {
  const { data } = (await supabase.rpc("outgoing_supports", { p_group: groupId })) as Rows<Record<string, unknown>>;
  return (data ?? []).map((o) => ({ name: o.full_name as string, date: o.service_date as string, siteName: o.site_name as string, toGroupName: (o.to_group_name as string | null) ?? null }));
}

/** Eventos (del grupo) donde la propia persona está marcada como ausente. */
export async function loadMyAbsences(supabase: SupabaseClient, userId: string): Promise<Set<string>> {
  const { data } = await supabase.from("service_absences").select("event_id").eq("user_id", userId);
  return new Set((data ?? []).map((a) => a.event_id));
}
