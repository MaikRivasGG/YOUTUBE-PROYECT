import { z } from "zod";

import { PRIORITIES } from "@/lib/domain/pipeline";
import { ROLES } from "@/lib/domain/roles";
import type { VideoPriority, VideoStatus, WorkspaceRole } from "@/types/database";

const roleValues = ROLES.map((role) => role.value) as [WorkspaceRole, ...WorkspaceRole[]];
const priorityValues = PRIORITIES.map((p) => p.value) as [VideoPriority, ...VideoPriority[]];

export const statusValues: [VideoStatus, ...VideoStatus[]] = [
  "idea",
  "script",
  "voiceover",
  "editing",
  "thumbnail",
  "review",
  "scheduled",
  "published",
  "archived",
];

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
  .min(8, "Mínimo 8 caracteres")
  .max(72, "Máximo 72 caracteres");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Escribe tu contraseña"),
});

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe tu nombre").max(80),
  email: emailSchema,
  password: passwordSchema,
});

export const requestResetSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(60),
});

export const channelSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  handle: optionalText(40),
  niche: optionalText(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal no valido"),
  youtube_url: optionalUrl,
  target_per_week: z.coerce.number().int().min(0).max(100),
});

export const createVideoSchema = z.object({
  title: z.string().trim().min(2, "Escribe un título").max(160),
  channel_id: z.string().uuid().nullable().optional(),
  status: z.enum(statusValues).default("idea"),
  priority: z.enum(priorityValues).default("normal"),
  hook: optionalText(300),
  due_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no valida")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export const updateVideoSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160).optional(),
  channel_id: z.string().uuid().nullable().optional(),
  priority: z.enum(priorityValues).optional(),
  hook: optionalText(300),
  description: optionalText(4000),
  script_body: optionalText(40000),
  youtube_url: optionalUrl,
  thumbnail_url: optionalUrl,
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  publish_at: z.string().datetime({ offset: true }).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
});

export const moveVideoSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(statusValues),
  position: z.number().finite(),
});

export const commentSchema = z.object({
  video_id: z.string().uuid(),
  body: z.string().trim().min(1, "El comentario esta vacio").max(4000),
});

export const checklistItemSchema = z.object({
  video_id: z.string().uuid(),
  title: z.string().trim().min(1, "Escribe la tarea").max(200),
  stage: z.enum(statusValues).nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
});

export const assetSchema = z.object({
  video_id: z.string().uuid(),
  kind: z.enum(["script", "voiceover", "footage", "thumbnail", "music", "other"]),
  label: z.string().trim().max(120).default(""),
  url: z.string().trim().url("URL no valida"),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z
    .enum(roleValues)
    .refine((role) => role !== "owner", "No se puede invitar como propietario"),
});

export const changeRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(roleValues),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ChannelInput = z.infer<typeof channelSchema>;
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
