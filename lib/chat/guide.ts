// Guía de la aplicación que el asistente usa para decir qué puede hacer cada persona. Es texto fijo del producto (no viene de la
// base de datos), así que puede responder con ella sin fuentes. Se adapta al rol para no ofrecer lo que la persona no puede usar.
export type GuideUser = {
  isAdmin: boolean;
  isHead: boolean;
  isLeader: boolean;
  groupRole: "coordinador" | "supervisor" | "voluntario" | null;
};

export function guideFor(u: GuideUser): string[] {
  const staff = u.isAdmin || u.isHead || u.isLeader;
  const lines = [
    "Inicio: saludo, tu grupo, tu próximo servicio y las novedades recientes.",
    "Novedades: noticias, cambios y avisos de la iglesia, tu sede, tu día o tu grupo, con enlaces.",
    "Manual: mapas con las posiciones de tu sede (pines), cada posición con su descripción, fotos, videos de YouTube y uso de radio; también los flujos (qué hacer, por ejemplo, cuando se llena el auditorio principal). Se puede filtrar por día y franja.",
    "Mi servicio: cuándo sirve tu grupo (calendario de las próximas semanas, con las fechas canceladas), las posiciones que te asignaron cuando la planeación está publicada, y tu historial de posiciones.",
    "Asistente (esta pantalla): resuelve dudas con lo que está cargado en la aplicación.",
    "Perfil (tu nombre arriba): ves tus datos, la política de datos y los términos y condiciones, puedes descargar tus datos y eliminar tu cuenta cuando quieras.",
  ];
  if (u.groupRole) lines.splice(4, 0, "Mi grupo: quiénes sirven contigo y con qué rol (nunca se ven los correos de otros).");
  if (u.groupRole === "coordinador") {
    lines.push(
      "Como coordinador: agregas supervisores y voluntarios a tu grupo (en Personas, con su correo de Google), planeas las posiciones del próximo servicio de tu grupo, las publicas para el grupo y puedes subir la programación como PDF, Excel o imagen. Los coordinadores coordinan el grupo y no ocupan posiciones.",
    );
  } else if (u.groupRole === "supervisor") {
    lines.push("Como supervisor: ayudas a planear las posiciones del próximo servicio de tu grupo (el borrador solo lo ven coordinadores y supervisores) y puedes subir la programación del servicio.");
  } else if (u.groupRole === "voluntario") {
    lines.push("Como voluntario: consultas el manual de tu sede, ves cuándo sirve tu grupo y qué posición te asignaron cuando se publica.");
  }
  if (u.isLeader) {
    lines.push(
      "Como líder de sede: administras las personas de tu sede (Personas), los horarios y grupos, y la rotación (orden de los grupos, generar las fechas, cancelar fechas, servicios especiales); editas el manual de tu sede y publicas novedades de tu sede.",
    );
  }
  if (u.isHead) lines.push("Como cabeza de ministerio: ves todas las sedes y grupos y haces lo mismo que un líder de sede en todas ellas.");
  if (u.isAdmin) lines.push("Como administrador: acceso a todo, y das los roles de administrador, cabeza y líder de sede en Personas → Líderes y administración.");
  if (staff) lines.push("La rotación funciona así: cada horario de cada sede rota sus grupos semana a semana; una fecha cancelada pierde su turno y la rotación sigue.");
  return lines;
}
