import type { VideoStatus, WorkspaceRole } from "@/types/database";

/**
 * Matriz de permisos del cliente.
 *
 * IMPORTANTE: esto solo sirve para decidir que se pinta en la interfaz. La
 * autoridad real es la funcion public.has_permission() de Postgres, que se
 * aplica en cada politica RLS. Ambas matrices deben mantenerse sincronizadas.
 */
export const PERMISSIONS = [
  "workspace.manage",
  "workspace.delete",
  "member.manage",
  "channel.manage",
  "video.create",
  "video.delete",
  "video.edit",
  "video.assign",
  "video.move.any",
  "comment.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_BUT_VIEWER: WorkspaceRole[] = [
  "owner",
  "admin",
  "producer",
  "writer",
  "voice",
  "editor",
  "designer",
  "publisher",
];

const MATRIX: Record<Permission, WorkspaceRole[]> = {
  "workspace.manage": ["owner", "admin"],
  "workspace.delete": ["owner"],
  "member.manage": ["owner", "admin"],
  "channel.manage": ["owner", "admin", "producer"],
  "video.create": ["owner", "admin", "producer", "writer"],
  "video.delete": ["owner", "admin", "producer"],
  "video.edit": ALL_BUT_VIEWER,
  "video.assign": ["owner", "admin", "producer"],
  "video.move.any": ["owner", "admin", "producer"],
  "comment.write": ALL_BUT_VIEWER,
};

export function can(role: WorkspaceRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[permission].includes(role);
}

/** Rol responsable de cada etapa del pipeline (espejo de public.stage_role). */
export const STAGE_ROLE: Record<VideoStatus, WorkspaceRole> = {
  idea: "producer",
  script: "writer",
  voiceover: "voice",
  editing: "editor",
  thumbnail: "designer",
  review: "producer",
  scheduled: "publisher",
  published: "publisher",
  archived: "producer",
};

/**
 * Espejo de public.can_move_video(): un miembro mueve una tarjeta si puede
 * mover cualquiera, si esta asignado a ella, o si su rol es responsable de la
 * etapa de origen o de destino.
 */
export function canMoveVideo(params: {
  role: WorkspaceRole | null | undefined;
  userId: string;
  assigneeIds: string[];
  from: VideoStatus;
  to: VideoStatus;
}): boolean {
  const { role, userId, assigneeIds, from, to } = params;
  if (!role || role === "viewer") return false;
  if (can(role, "video.move.any")) return true;
  if (assigneeIds.includes(userId)) return true;
  return role === STAGE_ROLE[from] || role === STAGE_ROLE[to];
}

export interface RoleMeta {
  value: WorkspaceRole;
  label: string;
  description: string;
  /** Clases Tailwind para el chip del rol. */
  chip: string;
}

export const ROLES: RoleMeta[] = [
  {
    value: "owner",
    label: "Propietario",
    description: "Control total del equipo, incluida su eliminación.",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  {
    value: "admin",
    label: "Administrador",
    description: "Gestiona miembros, canales y toda la producción.",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  {
    value: "producer",
    label: "Productor",
    description: "Crea videos, asigna trabajo y mueve cualquier tarjeta.",
    chip: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  {
    value: "writer",
    label: "Guionista",
    description: "Responsable de la etapa de guion.",
    chip: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  {
    value: "voice",
    label: "Locutor",
    description: "Responsable de la voz en off y la grabación.",
    chip: "bg-red-50 text-red-700 ring-red-200",
  },
  {
    value: "editor",
    label: "Editor",
    description: "Responsable del montaje y la edición.",
    chip: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  {
    value: "designer",
    label: "Diseñador",
    description: "Responsable de miniaturas y arte del canal.",
    chip: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  },
  {
    value: "publisher",
    label: "Publicador",
    description: "Programa y publica en YouTube.",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  {
    value: "viewer",
    label: "Observador",
    description: "Solo lectura. No puede editar ni comentar.",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
  },
];

const ROLE_MAP = new Map(ROLES.map((role) => [role.value, role]));

export function roleMeta(role: WorkspaceRole): RoleMeta {
  return ROLE_MAP.get(role) ?? ROLES[ROLES.length - 1];
}

/** Roles asignables desde la pantalla de equipo (owner se transfiere aparte). */
export const ASSIGNABLE_ROLES = ROLES.filter((role) => role.value !== "owner");
