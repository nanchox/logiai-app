export const DAY_LABEL: Record<string, string> = { miercoles: "Miércoles", sabado: "Sábado", domingo: "Domingo" };
export const SHIFT_LABEL: Record<string, string> = { am: "AM", pm: "PM", unica: "" };
export const GROUP_ROLE_LABEL: Record<string, string> = {
  coordinador: "Coordinador",
  supervisor: "Supervisor",
  voluntario: "Voluntario",
};
export const ZONE_KIND_LABEL: Record<string, string> = {
  orientacion: "Orientación (exterior)",
  acomodacion: "Acomodación (interior)",
  otro: "Otra",
};
export const LOCATION_KIND_LABEL: Record<string, string> = {
  auditorio: "Auditorio",
  teatro: "Teatro",
  overflow: "Overflow",
  salon: "Salones",
  exterior: "Exterior",
  otro: "Otro",
};

export const serviceLabel = (day: string, shift: string) =>
  [DAY_LABEL[day] ?? day, SHIFT_LABEL[shift] ?? ""].filter(Boolean).join(" ");
