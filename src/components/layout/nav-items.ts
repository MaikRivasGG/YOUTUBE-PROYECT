import {
  BarChart3,
  CalendarDays,
  KanbanSquare,
  LayoutGrid,
  PlaySquare,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Clave de contador opcional mostrada como badge. */
  badge?: "production";
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/resumen", label: "Resumen", icon: LayoutGrid },
  { href: "/produccion", label: "Producción", icon: KanbanSquare, badge: "production" },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/videos", label: "Videos", icon: PlaySquare },
  { href: "/equipo", label: "Equipo", icon: Users },
  { href: "/analiticas", label: "Analíticas", icon: BarChart3 },
];
