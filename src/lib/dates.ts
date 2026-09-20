import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isValid,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";

export function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
}

/** "Hoy", "Mañana", "25 sep" o "hace 3 d" segun la cercania de la fecha. */
export function dueLabel(value: string | null | undefined): string | null {
  const date = parse(value);
  if (!date) return null;
  const days = differenceInCalendarDays(date, new Date());
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  if (days < -1) return `${Math.abs(days)} d de retraso`;
  return format(date, "d MMM", { locale: es });
}

export function isOverdue(value: string | null | undefined): boolean {
  const date = parse(value);
  if (!date) return false;
  return differenceInCalendarDays(date, new Date()) < 0;
}

export function isDueSoon(value: string | null | undefined): boolean {
  const date = parse(value);
  if (!date) return false;
  const days = differenceInCalendarDays(date, new Date());
  return days >= 0 && days <= 2;
}

export function relative(value: string | null | undefined): string {
  const date = parse(value);
  if (!date) return "";
  return `Hace ${formatDistanceToNowStrict(date, { locale: es })}`;
}

export function longDate(date: Date = new Date()): string {
  const text = format(date, "EEEE, d 'de' MMMM", { locale: es });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function weekNumber(date: Date = new Date()): string {
  return format(date, "'Semana' w", { locale: es });
}

export function time(value: string | null | undefined): string {
  const date = parse(value);
  return date ? format(date, "HH:mm") : "";
}

export function dayMonth(value: string | Date | null | undefined): string {
  const date = typeof value === "string" ? parse(value) : (value ?? null);
  return date ? format(date, "d MMM", { locale: es }) : "";
}

export function toDateInput(value: string | null | undefined): string {
  const date = parse(value);
  return date ? format(date, "yyyy-MM-dd") : "";
}
