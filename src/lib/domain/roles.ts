import type { Role } from "@/types/database";

/**
 * Permisos del cliente.
 *
 * Solo sirven para decidir que se pinta. La autoridad es la funcion
 * public.has_permission() de Postgres, que suma los permisos de todos los
 * roles del miembro igual que se hace aqui.
 */
export const PERMISSIONS = [
  "workspace.manage",
  "workspace.delete",
  "member.manage",
  "channel.manage",
  "pipeline.manage",
  "video.create",
  "video.delete",
  "video.edit",
  "video.assign",
  "video.move.any",
  "comment.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Columna booleana de `roles` que concede cada permiso. */
export type PermissionFlag =
  | "manage_workspace"
  | "manage_members"
  | "manage_channels"
  | "manage_pipelines"
  | "create_videos"
  | "delete_videos"
  | "edit_videos"
  | "assign_videos"
  | "move_any_stage"
  | "write_comments";

const FLAG_BY_PERMISSION: Record<Exclude<Permission, "workspace.delete">, PermissionFlag> = {
  "workspace.manage": "manage_workspace",
  "member.manage": "manage_members",
  "channel.manage": "manage_channels",
  "pipeline.manage": "manage_pipelines",
  "video.create": "create_videos",
  "video.delete": "delete_videos",
  "video.edit": "edit_videos",
  "video.assign": "assign_videos",
  "video.move.any": "move_any_stage",
  "comment.write": "write_comments",
};

export function isOwner(roles: Role[]): boolean {
  return roles.some((role) => role.key === "owner");
}

/** Un permiso se concede si CUALQUIERA de los roles del miembro lo concede. */
export function can(roles: Role[], permission: Permission): boolean {
  if (permission === "workspace.delete") return isOwner(roles);
  const flag = FLAG_BY_PERMISSION[permission];
  return roles.some((role) => role[flag]);
}

/**
 * Espejo de public.can_move_video().
 *
 * Mueve quien puede mover cualquier tarjeta, quien la tiene asignada, y quien
 * gestiona la etapa de origen o la de destino por alguno de sus roles.
 */
export function canMoveVideo(params: {
  roles: Role[];
  /** Etapas que gestionan los roles del usuario. */
  managedStageIds: ReadonlySet<string>;
  userId: string;
  assigneeIds: string[];
  fromStageId: string;
  toStageId: string;
}): boolean {
  const { roles, managedStageIds, userId, assigneeIds, fromStageId, toStageId } = params;

  if (!can(roles, "video.edit")) return false;
  if (can(roles, "video.move.any")) return true;
  if (assigneeIds.includes(userId)) return true;

  return managedStageIds.has(fromStageId) || managedStageIds.has(toStageId);
}

/** Permisos editables desde el editor de roles, en el orden en que se muestran. */
export const PERMISSION_FIELDS: {
  flag: PermissionFlag;
  label: string;
  description: string;
}[] = [
  {
    flag: "edit_videos",
    label: "Editar videos",
    description: "Cambiar titulo, guion, fechas y archivos de una tarjeta.",
  },
  {
    flag: "write_comments",
    label: "Comentar",
    description: "Dejar feedback en la ficha de los videos.",
  },
  {
    flag: "create_videos",
    label: "Crear videos",
    description: "Anadir tarjetas nuevas al tablero.",
  },
  {
    flag: "delete_videos",
    label: "Eliminar videos",
    description: "Borrar tarjetas y su historial.",
  },
  {
    flag: "assign_videos",
    label: "Asignar personas",
    description: "Poner y quitar responsables en las tarjetas.",
  },
  {
    flag: "move_any_stage",
    label: "Mover cualquier etapa",
    description: "Saltarse el reparto por etapas y mover cualquier tarjeta.",
  },
  {
    flag: "manage_channels",
    label: "Gestionar canales",
    description: "Crear, editar y archivar los canales del equipo.",
  },
  {
    flag: "manage_pipelines",
    label: "Gestionar pipelines",
    description: "Crear flujos y editar sus etapas.",
  },
  {
    flag: "manage_members",
    label: "Gestionar el equipo",
    description: "Invitar, cambiar roles y dar de baja a miembros.",
  },
  {
    flag: "manage_workspace",
    label: "Configurar el equipo",
    description: "Cambiar el nombre del equipo y administrar los roles.",
  },
];

/** Resumen corto de lo que puede un rol, para listarlo en la interfaz. */
export function roleSummary(role: Role): string {
  if (role.key === "owner") return "Control total del equipo";
  if (role.key === "admin") return "Administra todo salvo eliminar el equipo";

  const granted = PERMISSION_FIELDS.filter((field) => role[field.flag]);
  if (granted.length === 0) return "Solo lectura";
  return granted.map((field) => field.label).join(" · ");
}
