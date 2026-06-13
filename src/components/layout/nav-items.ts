import {
  AlertTriangle,
  CalendarDays,
  Contact,
  CreditCard,
  FileText,
  FolderOpen,
  Gift,
  History,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  Megaphone,
  MessageSquare,
  Package,
  PieChart,
  Truck,
  UserPlus,
  Users,
  Wallet,
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
  // Chemins additionnels qui activent (surlignent) cette entrée — ex. la
  // Messagerie regroupe /communication (salons) ET /messages (privés).
  aliases?: string[];
}

// Raccourcis affichés directement dans la bottom-nav mobile (les plus utilisés).
// Un 5e slot « Menu » (ajouté par le composant) ouvre le reste.
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", shortLabel: "Accueil", icon: LayoutDashboard },
  { href: "/stock", label: "Stock", icon: Package, requires: "equipment.view" },
  { href: "/prets", label: "Prêts", icon: Truck, requires: "equipment.view" },
  { href: "/communication", label: "Messagerie", shortLabel: "Messages", icon: MessageSquare, aliases: ["/messages"] },
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
      { href: "/planning", label: "Planning", icon: CalendarDays, requires: "event.view" },
      { href: "/planning/taches", label: "Tâches", icon: ListTodo, requires: "task.view" },
      { href: "/annonces", label: "Annonces", icon: Megaphone },
      { href: "/communication", label: "Messagerie", icon: MessageSquare, aliases: ["/messages"] },
      { href: "/membres", label: "Membres", icon: Users, requires: "member.view" },
      { href: "/membres/annuaire", label: "Annuaire des compétences", icon: Contact, requires: "member.directory" },
    ],
  },
  {
    title: "Finances",
    items: [
      { href: "/finances/tableau-de-bord", label: "Tableau de bord", icon: PieChart, requires: "campaign.view" },
      { href: "/finances/cotisations", label: "Cotisations", icon: CreditCard, requires: "campaign.view" },
      { href: "/finances/notes", label: "Notes de frais", icon: Wallet, requires: "expense.view" },
      { href: "/finances/bilan", label: "Bilan annuel", icon: FileText, requires: "campaign.view" },
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

// Tous les chemins « racine » de la nav (href + alias), pour départager les
// préfixes qui se chevauchent (ex. /membres vs /membres/annuaire).
const ALL_NAV_HREFS: string[] = Array.from(
  new Set(
    [...PRIMARY_NAV, ...NAV_SECTIONS.flatMap((s) => s.items)].flatMap((it) => [
      it.href,
      ...(it.aliases ?? []),
    ]),
  ),
);

function pathMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Une entrée est active si l'un de ses chemins matche le pathname ET qu'aucun
// autre chemin de la nav, plus spécifique (plus long), ne matche aussi. Ainsi
// /membres ne se surligne pas quand on est sur /membres/annuaire.
export function isNavActive(
  pathname: string,
  href: string,
  aliases?: string[],
): boolean {
  const best = ALL_NAV_HREFS.filter((h) => pathMatches(pathname, h)).sort(
    (a, b) => b.length - a.length,
  )[0];
  if (!best) return false;
  return [href, ...(aliases ?? [])].includes(best);
}
