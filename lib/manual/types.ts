export type PositionKind = "supervisor" | "voluntario";
export type MediaKind = "foto" | "youtube" | "link";
export type Variant = "desktop" | "mobile";

export type ViewerMap = { id: string; name: string; zoneId: string | null; isGeneral: boolean; url: string | null; version: number; imagePath: string };
export type ViewerZone = { id: string; name: string; kind: string };
export type ViewerMedia = {
  id: string;
  kind: MediaKind;
  /** youtube / link: la URL; foto: URL firmada temporal. */
  url: string | null;
  path: string | null;
  caption: string | null;
};
export type ViewerPosition = {
  id: string;
  code: string;
  name: string;
  kind: PositionKind;
  description: string;
  usesRadio: boolean;
  zoneId: string | null;
  zoneName: string | null;
  days: string[];
  shifts: string[];
  isActive: boolean;
  media: ViewerMedia[];
};
export type ViewerMarker = { positionId: string; mapId: string; variant: Variant; top: number; left: number };

/** Una posición aplica si su lista de días/franjas está vacía (todas) o contiene la elegida. */
export const appliesTo = (p: Pick<ViewerPosition, "days" | "shifts">, day: string, shift: string) =>
  (day === "all" || p.days.length === 0 || p.days.includes(day)) &&
  (shift === "all" || p.shifts.length === 0 || p.shifts.includes(shift));
