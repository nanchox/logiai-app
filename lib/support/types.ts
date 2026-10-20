export type PersonOrigin = "miembro" | "apoyo";
export type EventPerson = { userId: string; name: string; role: "coordinador" | "supervisor" | "voluntario"; origin: PersonOrigin; groupName: string; absent: boolean };
export type Candidate = { userId: string; name: string; groupName: string; role: string };

export type ApplicationStatus = "pendiente" | "aprobada" | "rechazada" | "retirada";
export type OpenRequest = {
  requestId: string; date: string; siteName: string; day: string; shift: string; startTime: string | null; groupName: string;
  needed: number; filled: number; note: string | null; positions: string[]; myStatus: ApplicationStatus | null; applicationId: string | null;
};
export type EventRequest = { id: string; needed: number; filled: number; note: string | null; positionIds: string[] };
export type Application = { id: string; userId: string; name: string; groupName: string; role: string; status: ApplicationStatus; createdAt: string };
export type SupportEvent = { eventId: string; date: string; siteName: string; day: string; shift: string; groupName: string | null; source: "directo" | "solicitud"; status: string };
export type OutgoingSupport = { name: string; date: string; siteName: string; toGroupName: string | null };
