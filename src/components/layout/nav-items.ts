import {
  AlertTriangle,
  History,
  LayoutDashboard,
  type LucideIcon,
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
  { href: "/membres", label: "Membres", icon: Users },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/inscriptions", label: "Inscriptions", icon: UserPlus, adminOnly: true },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, adminOnly: true },
  { href: "/admin/audit", label: "Journal d'audit", icon: History, adminOnly: true },
];

// Items mobile : sous-ensemble du MAIN_NAV qui tient en bottom-nav
export const BOTTOM_NAV: NavItem[] = MAIN_NAV.slice(0, 4); // Dashboard, Stock, Prêts, Incidents
