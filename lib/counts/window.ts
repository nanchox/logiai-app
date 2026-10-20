// Cuándo se pueden registrar los conteos de un servicio. Es el mismo criterio de can_count_event en la base de datos
// (que es la que manda): desde el día del servicio; quien planifica hasta el final del día siguiente; después, solo el líder.
import { addDays } from "@/lib/service/dates";

export type CountWindow = "pronto" | "abierto" | "cerrado";

/** Estado para quien planifica el servicio (coordinador o supervisor del grupo). */
export function countWindow(serviceDate: string, today: string): CountWindow {
  if (today < serviceDate) return "pronto";
  return today <= addDays(serviceDate, 1) ? "abierto" : "cerrado";
}

/** ¿Puede registrar ahora? El líder, la cabeza y el administrador pueden desde el día del servicio sin límite. */
export function canCountNow(serviceDate: string, today: string, manager: boolean): boolean {
  if (today < serviceDate) return false;
  return manager || countWindow(serviceDate, today) === "abierto";
}
