import { CalendarPlus, Sparkles, UserPlus, Wallet } from 'lucide-react';

/** "+ Nouveau": what the team adds most, one click from anywhere (staff only). */
export const QUICK_ACTIONS = [
  { key: 'stay', label: 'Nouvelle réservation', hint: 'Séjour direct ou d’une plateforme', icon: CalendarPlus, url: '/reservations?new=1' },
  { key: 'extra', label: 'Nouvel extra', hint: 'Quad, chef, transfert, massage…', icon: Sparkles, url: '/extras?new=extra' },
  { key: 'settlement', label: 'Nouveau règlement', hint: 'Paiement d’un client, versement…', icon: Wallet, url: '/extras?new=settlement' },
  { key: 'invite', label: 'Inviter un client', hint: 'Livret d’accueil et services de la villa', icon: UserPlus, url: '/accueil' },
] as const;

export const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
