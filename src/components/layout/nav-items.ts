import {
  AlertTriangle,
  FolderOpen,
  Gift,
  History,
  LayoutDashboard,
  type LucideIcon,
  MessageSquare,
  Package,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/stock", label: "Stock", icon: Package },
  { href: "/prets", label: "Prêts", icon: Truck },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/communication", label: "Communication", icon: MessageSquare },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/dons", label: "Dons", icon: Gift, adminOnly: true },
  { href: "/admin/inscriptions", label: "Inscriptions", icon: UserPlus, adminOnly: true },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, adminOnly: true },
  { href: "/admin/categories", label: "Catégories", icon: FolderOpen, adminOnly: true },
  { href: "/admin/audit", label: "Journal d'audit", icon: History, adminOnly: true },
];

// Items mobile : reflet de MAIN_NAV (4 entrées tiennent en bottom-nav)
export const BOTTOM_NAV: NavItem[] = MAIN_NAV;
