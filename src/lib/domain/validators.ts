import { z } from "zod";

import { PRIORITIES } from "@/lib/domain/pipeline";
import { REQUIRABLE_FIELDS, type StageKind, type VideoPriority } from "@/types/database";

const priorityValues = PRIORITIES.map((p) => p.value) as [VideoPriority, ...VideoPriority[]];

const stageKindValues: [StageKind, ...StageKind[]] = [
  "backlog",
  "work",
  "review",
  "scheduled",
  "done",
  "archived",
];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal no valido");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^https?:\/\//i.test(value), "Debe ser una URL http(s) valida")
  .transform((value) => (value.length === 0 ? null : value))
  .nullable()
  .optional();

export const emailSchema = z.string().trim().toLowerCase().email("Email no valido");

export const passwordSchema = z
  .string()
  .min(8, "Minimo 8 caracteres")
  .max(72, "Maximo 72 caracteres");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Escribe tu contrasena"),
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe tu nombre").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const requestResetSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((data) => data.password === data.confirm, {
    message: "Las contrasenas no coinciden",
    path: ["confirm"],
  });

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Minimo 2 caracteres").max(60),
});

export const deleteWorkspaceSchema = z.object({
  /** Se escribe el nombre del equipo para confirmar. */
  confirmation: z.string().trim().min(1, "Escribe el nombre del equipo"),
});

export const pipelineSchema = z.object({
  name: z.string().trim().min(2, "Minimo 2 caracteres").max(60),
  description: optionalText(200),
});

export const stageSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(40),
  color: hexColor,
  kind: z.enum(stageKindValues),
  /**
   * Nombre del enlace que exige esta etapa (ej. "Enlace del guion"). Vacio
   * significa que la etapa no pide ningun entregable.
   */
  deliverable_label: optionalText(60),
  required_fields: z.array(z.enum(REQUIRABLE_FIELDS)).default([]),
});

export const roleSchema = z.object({
  name: z.string().trim().min(2, "Minimo 2 caracteres").max(40),
  color: hexColor,
  manage_workspace: z.boolean().default(false),
  manage_members: z.boolean().default(false),
  manage_channels: z.boolean().default(false),
  manage_pipelines: z.boolean().default(false),
  create_videos: z.boolean().default(false),
  delete_videos: z.boolean().default(false),
  edit_videos: z.boolean().default(true),
  assign_videos: z.boolean().default(false),
  move_any_stage: z.boolean().default(false),
  manage_checklist: z.boolean().default(false),
  write_comments: z.boolean().default(true),
  stage_ids: z.array(z.string().uuid()).default([]),
});

export const channelSchema = z.object({
  name: z.string().trim().min(2, "Minimo 2 caracteres").max(80),
  handle: optionalText(40),
  niche: optionalText(60),
  color: hexColor,
  image_url: optionalUrl,
  youtube_url: optionalUrl,
  pipeline_id: z.string().uuid().nullable().optional(),
  target_per_week: z.coerce.number().int().min(0).max(100),
});

export const createVideoSchema = z.object({
  title: z.string().trim().min(2, "Escribe un titulo").max(160),
  channel_id: z.string().uuid().nullable().optional(),
  pipeline_id: z.string().uuid("Elige un pipeline"),
  stage_id: z.string().uuid("Elige una etapa"),
  priority: z.enum(priorityValues).default("normal"),
  reference_url: optionalUrl,
  due_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no valida")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export const moveVideoSchema = z.object({
  id: z.string().uuid(),
  stage_id: z.string().uuid(),
  position: z.number().finite(),
});

export const commentSchema = z.object({
  video_id: z.string().uuid(),
  body: z.string().trim().min(1, "El comentario esta vacio").max(4000),
});

export const checklistItemSchema = z.object({
  video_id: z.string().uuid(),
  title: z.string().trim().min(1, "Escribe la tarea").max(200),
  role_id: z.string().uuid().nullable().optional(),
});

/** El enlace que se guarda al completar el entregable de una etapa. */
export const stageLinkSchema = z.object({
  video_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  url: z
    .string()
    .trim()
    .refine((value) => /^https?:\/\//i.test(value), "Debe ser una URL http(s) valida"),
});

export const duplicatePipelineSchema = z.object({
  pipeline_id: z.string().uuid(),
  name: z.string().trim().min(2, "Minimo 2 caracteres").max(60),
});

export const assetSchema = z.object({
  video_id: z.string().uuid(),
  kind: z.enum(["script", "voiceover", "footage", "thumbnail", "music", "other"]),
  label: z.string().trim().max(120).default(""),
  url: z.string().trim().url("URL no valida"),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role_id: z.string().uuid("Elige un rol"),
});

export const memberRolesSchema = z.object({
  user_id: z.string().uuid(),
  role_ids: z.array(z.string().uuid()).max(12),
});

export type ChannelInput = z.infer<typeof channelSchema>;
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type RoleInput = z.infer<typeof roleSchema>;
export type StageInput = z.infer<typeof stageSchema>;
export type StageLinkInput = z.infer<typeof stageLinkSchema>;
