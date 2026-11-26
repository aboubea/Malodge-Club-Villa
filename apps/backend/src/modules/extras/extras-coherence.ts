/**
 * Data coherence report: everything that does not add up between villas,
 * stays (Lodgify bookings and extras stays), extras, payments and Lodgify.
 * Read-only: nothing is changed, each finding says where to fix it.
 */
import { PrismaClient } from '@prisma/client';
import { villaCandidates, villaSimilarity } from '@malodge/shared';
import { canonicalCountry } from '../../common/geo';
import { currencyForCountry } from '../../common/money';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  title: string;
  detail?: string;
  /** Where to fix it in the app. */
  href?: string;
  items: { label: string; href?: string }[];
}

export interface CoherenceReport {
  generatedAt: string;
  summary: Record<Severity, number>;
  sections: { key: string; title: string; findings: Finding[] }[];
}

/** Lines of the extras tracking, as computed by ExtrasService.listExtras. */
interface Line {
  id: string;
  orderId: string;
  date: string | Date | null;
  label: string;
  currency: string;
  serviceId: string | null;
  cancelled: boolean;
  issue: string | null;
  warning: string | null;
  stay: { id: string; label: string; checkIn?: Date | string | null; checkOut?: Date | string | null } | null;
  villa: { id: string; name: string } | null;
}

const day = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(d)) : '—';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Edit distance, to spot the same name typed twice ("Marc brunet" / "Marck brunet"). */
function distance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export async function coherenceReport(prisma: PrismaClient, lines: Line[]): Promise<CoherenceReport> {
  const [villas, stays, settlements, items] = await Promise.all([
    prisma.villa.findMany({
      select: { id: true, name: true, country: true, currency: true, logifyId: true, ownerId: true, isActive: true, bedrooms: true, maxGuests: true },
    }),
    prisma.reservation.findMany({
      select: {
        id: true, label: true, villaId: true, checkIn: true, checkOut: true, status: true, source: true, logifyId: true, datesEstimated: true,
        client: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.settlement.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { id: true, status: true, date: true, amount: true, currency: true, person: { select: { firstName: true, lastName: true } } },
    }),
    prisma.orderItem.findMany({
      where: { serviceId: { not: null } },
      select: {
        id: true,
        service: { select: { name: true, currency: true } },
        order: { select: { id: true, villaId: true, reservation: { select: { villaId: true, label: true } } } },
      },
    }),
  ]);
  const villaById = new Map(villas.map((v) => [v.id, v]));
  const stayName = (s: (typeof stays)[number]) => s.label || [s.client?.firstName, s.client?.lastName].filter(Boolean).join(' ') || 'Client';
  const lodgifyVillas = villas.filter((v) => v.logifyId);
  const extrasByVilla = new Map<string, number>();
  for (const l of lines) if (l.villa && !l.cancelled) extrasByVilla.set(l.villa.id, (extrasByVilla.get(l.villa.id) ?? 0) + 1);

  /* ── Villas ── */
  const villaFindings: Finding[] = [];
  const dupes = villas
    .filter((v) => !v.logifyId)
    .map((v) => ({ v, c: villaCandidates(v.name, lodgifyVillas) }))
    .filter((x) => x.c.length);
  if (dupes.length)
    villaFindings.push({
      severity: 'warning',
      title: `${dupes.length} villa(s) en double avec une annonce Lodgify`,
      detail: 'Les séjours et extras sont répartis sur deux fiches pour la même maison. Glissez la villa sur son annonce Lodgify (page Villas).',
      href: '/villas',
      items: dupes.map(({ v, c }) => ({ label: `${v.name} ↔ ${c.map((x) => x.name).join(' / ')}${c.length > 1 ? ' (à choisir)' : ''}` })),
    });
  const lodgifyTwins: string[] = [];
  lodgifyVillas.forEach((a, i) =>
    lodgifyVillas.slice(i + 1).forEach((b) => {
      if (villaSimilarity(a.name, b.name) === 1) lodgifyTwins.push(`${a.name} / ${b.name}`);
    }),
  );
  if (lodgifyTwins.length)
    villaFindings.push({
      severity: 'info',
      title: 'Annonces Lodgify qui se ressemblent',
      detail: 'Deux annonces pour la même maison ? Les réservations restent sur chaque annonce (rien n’est modifié dans Lodgify).',
      items: lodgifyTwins.map((label) => ({ label })),
    });
  const badCountry = villas.filter((v) => v.country && canonicalCountry(v.country) !== v.country);
  if (badCountry.length)
    villaFindings.push({
      severity: 'warning',
      title: 'Pays écrits de plusieurs façons',
      detail: 'Corrigé automatiquement au prochain démarrage du serveur ou à la prochaine synchronisation.',
      items: badCountry.map((v) => ({ label: `${v.name} : « ${v.country} » → « ${canonicalCountry(v.country)} »`, href: `/villas/${v.id}` })),
    });
  const badCurrency = villas.filter((v) => v.currency !== currencyForCountry(v.country));
  if (badCurrency.length)
    villaFindings.push({
      severity: badCurrency.some((v) => extrasByVilla.get(v.id)) ? 'warning' : 'info',
      title: 'Devise différente de celle du pays',
      detail: 'Une villa Lodgify encore en euros dans un pays en dirhams passe en MAD à la prochaine synchronisation, ses extras convertis au taux du jour (montant en euros conservé).',
      items: badCurrency.map((v) => ({ label: `${v.name} (${v.country}) : ${v.currency}, attendu ${currencyForCountry(v.country)}${extrasByVilla.get(v.id) ? ` · ${extrasByVilla.get(v.id)} extra(s)` : ''}`, href: `/villas/${v.id}` })),
    });
  const noOwner = villas.filter((v) => !v.ownerId && extrasByVilla.get(v.id));
  if (noOwner.length)
    villaFindings.push({
      severity: 'warning',
      title: 'Villas avec extras mais sans propriétaire',
      detail: 'La part du propriétaire n’est pas calculée pour ces villas.',
      items: noOwner.map((v) => ({ label: `${v.name} · ${extrasByVilla.get(v.id)} extra(s)`, href: `/villas/${v.id}` })),
    });
  const noCapacity = villas.filter((v) => v.isActive && (!v.bedrooms || !v.maxGuests));
  if (noCapacity.length)
    villaFindings.push({
      severity: 'info',
      title: 'Capacité non renseignée',
      items: noCapacity.map((v) => ({ label: v.name, href: `/villas/${v.id}` })),
    });

  /* ── Stays ── */
  const stayFindings: Finding[] = [];
  const live = stays.filter((s) => s.status !== 'CANCELLED');
  const undated = live.filter((s) => !s.checkIn || !s.checkOut);
  if (undated.length)
    stayFindings.push({
      severity: 'warning',
      title: `${undated.length} séjour(s) sans dates`,
      detail: 'Absents de l’agenda et du calendrier, leurs extras ne peuvent pas être contrôlés. Saisissez les dates dans Suivi des extras > Réglages > Séjours.',
      href: '/extras/reglages',
      items: undated.map((s) => ({ label: `${stayName(s)} · ${villaById.get(s.villaId)?.name ?? '—'}` })),
    });
  const reversed = live.filter((s) => s.checkIn && s.checkOut && s.checkOut < s.checkIn);
  if (reversed.length)
    stayFindings.push({
      severity: 'error',
      title: 'Départ avant l’arrivée',
      items: reversed.map((s) => ({ label: `${stayName(s)} : ${day(s.checkIn)} → ${day(s.checkOut)}` })),
    });
  const estimated = live.filter((s) => s.datesEstimated);
  if (estimated.length)
    stayFindings.push({
      severity: 'warning',
      title: 'Séjours aux dates déduites (anciens imports)',
      detail: 'Leurs dates ne viennent pas du fichier. Utilisez « Vérifier les dates avec le fichier » (Import Excel).',
      href: '/extras/reglages',
      items: estimated.map((s) => ({ label: `${stayName(s)} : ${day(s.checkIn)} → ${day(s.checkOut)}` })),
    });
  const overlaps: { a: (typeof live)[number]; b: (typeof live)[number] }[] = [];
  const dated = live.filter((s) => s.checkIn && s.checkOut);
  const byVilla = new Map<string, typeof dated>();
  for (const s of dated) byVilla.set(s.villaId, [...(byVilla.get(s.villaId) ?? []), s]);
  for (const list of byVilla.values()) {
    list.sort((x, y) => x.checkIn!.getTime() - y.checkIn!.getTime());
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length && list[j].checkIn! < list[i].checkOut!; j++) overlaps.push({ a: list[i], b: list[j] });
  }
  const lodgifyPair = overlaps.filter(({ a, b }) => !!a.logifyId !== !!b.logifyId);
  const doubleBooking = overlaps.filter(({ a, b }) => a.logifyId && b.logifyId);
  const otherOverlap = overlaps.filter(({ a, b }) => !a.logifyId && !b.logifyId);
  const pairLabel = ({ a, b }: { a: (typeof live)[number]; b: (typeof live)[number] }) =>
    `${villaById.get(a.villaId)?.name} : ${stayName(a)}${a.logifyId ? ' (Lodgify)' : ''} ${day(a.checkIn)} → ${day(a.checkOut)} / ${stayName(b)}${b.logifyId ? ' (Lodgify)' : ''} ${day(b.checkIn)} → ${day(b.checkOut)}`;
  if (doubleBooking.length)
    stayFindings.push({ severity: 'error', title: 'Double réservation Lodgify sur la même villa', href: '/reservations', items: doubleBooking.map((p) => ({ label: pairLabel(p) })) });
  if (lodgifyPair.length)
    stayFindings.push({
      severity: 'warning',
      title: 'Séjour du suivi des extras qui chevauche une réservation Lodgify',
      detail: 'Souvent le même séjour saisi deux fois : il apparaît en double dans l’agenda.',
      href: '/reservations',
      items: lodgifyPair.map((p) => ({ label: pairLabel(p) })),
    });
  if (otherOverlap.length)
    stayFindings.push({ severity: 'warning', title: 'Séjours qui se chevauchent sur la même villa', href: '/reservations', items: otherOverlap.map((p) => ({ label: pairLabel(p) })) });
  const twins: string[] = [];
  live.forEach((a, i) =>
    live.slice(i + 1).forEach((b) => {
      if (a.villaId !== b.villaId) return;
      const na = norm(stayName(a));
      const nb = norm(stayName(b));
      if (na !== nb && Math.min(na.length, nb.length) >= 4 && distance(na, nb) <= 2) twins.push(`${stayName(a)} / ${stayName(b)} · ${villaById.get(a.villaId)?.name ?? ''}`);
    }),
  );
  if (twins.length)
    stayFindings.push({
      severity: 'warning',
      title: 'Même client saisi deux fois ?',
      detail: 'Deux séjours au nom presque identique sur la même villa (faute de frappe dans le fichier ?).',
      href: '/extras/reglages',
      items: twins.map((label) => ({ label })),
    });

  /* ── Extras ── */
  const extraFindings: Finding[] = [];
  const active = lines.filter((l) => !l.cancelled);
  const outside = active.filter((l) => l.warning);
  if (outside.length)
    extraFindings.push({
      severity: 'warning',
      title: `${outside.length} extra(s) daté(s) hors du séjour`,
      detail: 'Fidèle au fichier, mais probablement une erreur de saisie de date.',
      href: '/extras/saisie?stays=all',
      items: outside.map((l) => ({
        label: `${l.stay?.label ?? '—'} — ${l.label} le ${day(l.date)} (séjour ${day(l.stay?.checkIn)} → ${day(l.stay?.checkOut)})`,
        href: `/extras/saisie?stayId=${l.stay?.id}&stays=all`,
      })),
    });
  const unchecked = active.filter((l) => l.stay && (!l.stay.checkIn || !l.stay.checkOut));
  if (unchecked.length)
    extraFindings.push({
      severity: 'info',
      title: `${unchecked.length} extra(s) sur des séjours sans dates`,
      detail: 'Leur date ne peut pas être comparée au séjour.',
      items: unchecked.map((l) => ({ label: `${l.stay?.label} — ${l.label} le ${day(l.date)}` })),
    });
  const undatedExtras = active.filter((l) => !l.date);
  if (undatedExtras.length)
    extraFindings.push({
      severity: 'warning',
      title: 'Extras sans date de prestation',
      detail: 'Ils ne comptent dans aucun chiffre d’affaires (compté à la date de la prestation).',
      items: undatedExtras.map((l) => ({ label: `${l.stay?.label ?? '—'} — ${l.label}` })),
    });
  const incomplete = active.filter((l) => l.issue);
  if (incomplete.length)
    extraFindings.push({
      severity: 'warning',
      title: `${incomplete.length} extra(s) à compléter`,
      detail: 'Prix, coût, prestataire ou taux manquant : les comptes ne sont pas définitifs.',
      href: '/extras/saisie?incomplete=true&stays=all',
      items: incomplete.map((l) => ({ label: `${l.stay?.label ?? '—'} — ${l.label} : ${l.issue}` })),
    });
  const currencyMismatch = items.filter((it) => {
    const villaId = it.order.villaId ?? it.order.reservation?.villaId;
    const v = villaId ? villaById.get(villaId) : null;
    return v && it.service && it.service.currency !== v.currency;
  });
  if (currencyMismatch.length)
    extraFindings.push({
      severity: 'warning',
      title: 'Prestation au catalogue dans une autre devise que la villa',
      detail: 'L’extra est compté dans la devise de la villa : vérifiez le prix saisi.',
      items: currencyMismatch.map((it) => {
        const v = villaById.get((it.order.villaId ?? it.order.reservation?.villaId)!)!;
        return { label: `${it.order.reservation?.label ?? '—'} — ${it.service!.name} : catalogue en ${it.service!.currency}, villa ${v.name} en ${v.currency}` };
      }),
    });

  /* ── Payments ── */
  const settleFindings: Finding[] = [];
  const validatedNoDate = settlements.filter((s) => s.status === 'VALIDATED' && !s.date);
  if (validatedNoDate.length)
    settleFindings.push({
      severity: 'warning',
      title: 'Règlements validés sans date',
      items: validatedNoDate.map((s) => ({ label: `${[s.person.firstName, s.person.lastName].join(' ')} · ${s.amount} ${s.currency}` })),
    });
  const pending = settlements.filter((s) => s.status === 'PENDING');
  if (pending.length)
    settleFindings.push({
      severity: 'info',
      title: `${pending.length} règlement(s) à valider`,
      detail: 'Non comptés dans les soldes tant qu’ils ne sont pas validés.',
      href: '/extras/reglements?status=PENDING',
      items: pending.map((s) => ({ label: `${[s.person.firstName, s.person.lastName].join(' ')} · ${s.amount} ${s.currency}${s.date ? ` · ${day(s.date)}` : ''}` })),
    });

  /* ── Lodgify ── */
  const lodgifyFindings: Finding[] = [];
  const lodgifyBookings = stays.filter((s) => s.logifyId || s.source === 'lodgify');
  if (lodgifyVillas.length && !lodgifyBookings.length)
    lodgifyFindings.push({
      severity: 'warning',
      title: 'Aucune réservation Lodgify dans l’appli',
      detail: `${lodgifyVillas.length} annonce(s) Lodgify mais aucune réservation synchronisée : l’agenda et le calendrier ne montrent que les séjours du suivi des extras. Lancez « Tout synchroniser » (Paramètres > Lodgify).`,
      href: '/parametres',
      items: [],
    });

  const sections = [
    { key: 'villas', title: 'Villas', findings: villaFindings },
    { key: 'stays', title: 'Séjours et réservations', findings: stayFindings },
    { key: 'extras', title: 'Extras', findings: extraFindings },
    { key: 'settlements', title: 'Règlements', findings: settleFindings },
    { key: 'lodgify', title: 'Lodgify', findings: lodgifyFindings },
  ];
  const summary: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const s of sections) for (const f of s.findings) summary[f.severity]++;
  return { generatedAt: new Date().toISOString(), summary, sections };
}
