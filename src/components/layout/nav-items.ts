import {
  AlertTriangle,
  Contact,
  FolderOpen,
  Gift,
  History,
  LayoutDashboard,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Package,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";

import type { Action } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  // Libellé court pour la bottom-nav mobile (espace réduit).
  shortLabel?: string;
  icon: LucideIcon;
  // Permission requise pour voir l'entrée (filtrage par rôle, US-29).
  // Absente = visible par tout utilisateur actif.
  requires?: Action;
}

// Raccourcis affichés directement dans la bottom-nav mobile (les plus utilisés).
// Un 5e slot « Menu » (ajouté par le composant) ouvre le reste.
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", shortLabel: "Accueil", icon: LayoutDashboard },
  { href: "/stock", label: "Stock", icon: Package, requires: "equipment.view" },
  { href: "/prets", label: "Prêts", icon: Truck, requires: "equipment.view" },
  { href: "/communication", label: "Communication", shortLabel: "Messages", icon: MessageSquare },
];

// Tous les modules, groupés par domaine. Filtrés par rôle à l'affichage.
// Pattern « barre + Menu » : scale en ajoutant des entrées ici.
export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Inventaire",
    items: [
      { href: "/stock", label: "Stock", icon: Package, requires: "equipment.view" },
      { href: "/prets", label: "Prêts", icon: Truck, requires: "loan.view" },
      { href: "/incidents", label: "Incidents", icon: AlertTriangle, requires: "incident.view" },
    ],
  },
  {
    title: "Vie du groupe",
    items: [
      { href: "/annonces", label: "Annonces", icon: Megaphone },
      { href: "/communication", label: "Communication", icon: MessageSquare },
      { href: "/messages", label: "Messages", icon: MessageCircle },
      { href: "/membres/annuaire", label: "Annuaire des compétences", icon: Contact, requires: "member.directory" },
    ],
  },
  {
    title: "Administration",
    items: [
      // US-32 — chaque rubrique est filtrée par sa permission propre :
      // dons/catégories → RESPONSABLE_MATERIEL ; inscriptions/utilisateurs →
      // SECRÉTAIRE ; journal d'audit → ADMIN.
      { href: "/admin/dons", label: "Dons", icon: Gift, requires: "donation.view" },
      { href: "/admin/inscriptions", label: "Inscriptions", icon: UserPlus, requires: "user.approve" },
      { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, requires: "user.manage" },
      { href: "/admin/categories", label: "Catégories", icon: FolderOpen, requires: "category.manage" },
      { href: "/admin/audit", label: "Journal d'audit", icon: History, requires: "audit.view" },
    ],
  },
];
