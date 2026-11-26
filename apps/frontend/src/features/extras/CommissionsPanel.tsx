import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CircleAlert, Home, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn, formatDay, formatMoney } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuthStore } from '../../store/authStore';
import { pct } from './api';
import { Field, Segmented, Select, TableCard, TextInput, td, th } from './ui';

type Base = 'MARGIN' | 'MALODGE_SHARE' | 'PRICE' | 'FIXED';
type Who = 'OWNER' | 'EMPLOYEE';
interface Rule {
  id: string;
  beneficiary: Who;
  person: { id: string; name: string } | null;
  villa: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  service: { id: string; name: string } | null;
  base: Base;
  rate: number | null;
  amount: number | null;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
  specificity: number;
  description: string;
  activeToday: boolean;
  usage: { count: number; share: number };
  conflicts: string[];
}
interface Options {
  owners: { id: string; name: string; rate: number | null }[];
  employees: { id: string; name: string; rate: number | null; base: 'MALODGE_MARGIN' | 'TOTAL_MARGIN' | null }[];
  houses: { id: string; name: string; currency: string; isActive: boolean; managementFeeRate: number; owner: { id: string; name: string } | null }[];
  categories: { id: string; name: string }[];
  services: { id: string; name: string; categoryId: string }[];
}
export interface RuleDraft {
  beneficiary: Who;
  personId: string;
  villaId: string;
  categoryId: string;
  serviceId: string;
  base: Base;
  rate: string;
  amount: string;
  validFrom: string;
  validTo: string;
  note: string;
}

const BASES: Record<Base, string> = {
  MARGIN: 'de la marge (prix − coût)',
  MALODGE_SHARE: 'de la part Malodge (après le propriétaire)',
  PRICE: 'du prix payé par le client',
  FIXED: 'montant fixe par unité vendue',
};
const empty = (beneficiary: Who): RuleDraft => ({ beneficiary, personId: '', villaId: '', categoryId: '', serviceId: '', base: beneficiary === 'OWNER' ? 'MARGIN' : 'MALODGE_SHARE', rate: '', amount: '', validFrom: '', validTo: '', note: '' });
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

export function useCommissionRules() {
  return useQuery({
    queryKey: ['extras', 'commission-rules'],
    queryFn: async () => {
      const r = await apiClient.get('/extras/commission-rules');
      return (r.data?.data ?? r.data) as { rules: Rule[]; options: Options };
    },
  });
}

/** Where a rule applies, in words. */
function scope(r: Rule, who: Who) {
  return {
    person: r.person?.name ?? (who === 'OWNER' ? 'Tous les propriétaires' : 'Tous les salariés'),
    villa: r.villa?.name ?? 'Toutes les villas',
    what: r.service?.name ?? (r.category ? `Catégorie ${r.category.name}` : 'Tous les extras'),
    period: r.validFrom || r.validTo ? `${r.validFrom ? `du ${formatDay(r.validFrom)}` : 'jusqu’'} ${r.validTo ? `au ${formatDay(r.validTo)}` : 'sans fin'}` : 'Toujours',
  };
}

/** A rule's share on an example extra (1 000 sold, cost 600, owner 50 % of the margin before the employee). */
function example(d: RuleDraft) {
  const total = 1_000;
  const cost = 600;
  const margin = total - cost;
  const rate = (num(d.rate) ?? 0) / 100;
  const amount = num(d.amount) ?? 0;
  const malodge = margin - margin * 0.5;
  const share = d.base === 'MARGIN' ? margin * rate : d.base === 'PRICE' ? total * rate : d.base === 'MALODGE_SHARE' ? malodge * rate : amount;
  return { share: Math.round(share * 100) / 100, total, cost, margin, malodge };
}

export function RuleModal({ open, onClose, initial, ruleId, options }: { open: boolean; onClose: () => void; initial: RuleDraft; ruleId?: string; options: Options }) {
  const qc = useQueryClient();
  const [d, setD] = useState<RuleDraft>(initial);
  useEffect(() => {
    if (open) setD(initial);
  }, [open, initial]);
  const set = <K extends keyof RuleDraft>(k: K, v: RuleDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const people = d.beneficiary === 'OWNER' ? options.owners : options.employees;
  const services = options.services.filter((s) => !d.categoryId || s.categoryId === d.categoryId);
  const ex = example(d);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        beneficiary: d.beneficiary,
        personId: d.personId || null,
        villaId: d.villaId || null,
        categoryId: d.serviceId ? null : d.categoryId || null,
        serviceId: d.serviceId || null,
        base: d.base,
        rate: d.base === 'FIXED' ? null : (num(d.rate) ?? 0) / 100,
        amount: d.base === 'FIXED' ? num(d.amount) : null,
        validFrom: d.validFrom || null,
        validTo: d.validTo || null,
        note: d.note || null,
      };
      return ruleId ? apiClient.put(`/extras/commission-rules/${ruleId}`, body) : apiClient.post('/extras/commission-rules', body);
    },
    onSuccess: () => {
      toast.success('Règle enregistrée : les extras sont recalculés');
      qc.invalidateQueries({ queryKey: ['extras'] });
      onClose();
    },
  });

  const valid = d.base === 'FIXED' ? num(d.amount) != null && num(d.amount)! >= 0 : num(d.rate) != null && num(d.rate)! >= 0 && num(d.rate)! <= 100;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ruleId ? 'Modifier la règle' : 'Nouvelle règle de commission'}
      description="Elle remplace le taux habituel de la personne sur les extras qu’elle vise. La règle la plus précise l’emporte."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={d.beneficiary}
          onChange={(v) => setD({ ...empty(v), villaId: d.villaId, categoryId: d.categoryId, serviceId: d.serviceId, validFrom: d.validFrom, validTo: d.validTo })}
          options={[
            { value: 'OWNER', label: 'Part du propriétaire' },
            { value: 'EMPLOYEE', label: 'Commission du salarié' },
          ]}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={d.beneficiary === 'OWNER' ? 'Propriétaire' : 'Salarié'} hint="Vide : tout le monde">
            <Select value={d.personId} onChange={(e) => set('personId', e.target.value)}>
              <option value="">{d.beneficiary === 'OWNER' ? 'Tous les propriétaires' : 'Tous les salariés'}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.rate != null ? ` (habituel ${pct(p.rate)})` : ' (pas de taux habituel)'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Villa" hint="Ses variantes Lodgify comprises">
            <Select value={d.villaId} onChange={(e) => set('villaId', e.target.value)}>
              <option value="">Toutes les villas</option>
              {options.houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Catégorie">
            <Select
              value={d.categoryId}
              onChange={(e) => {
                const categoryId = e.target.value;
                setD((x) => ({ ...x, categoryId, serviceId: x.serviceId && options.services.find((s) => s.id === x.serviceId)?.categoryId !== categoryId ? '' : x.serviceId }));
              }}
            >
              <option value="">Toutes les catégories</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prestation">
            <Select value={d.serviceId} onChange={(e) => set('serviceId', e.target.value)}>
              <option value="">{d.categoryId ? 'Toute la catégorie' : 'Toutes les prestations'}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rounded-2xl bg-surface-2/60 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
            <Field label="Calcul">
              <Select value={d.base} onChange={(e) => set('base', e.target.value as Base)}>
                {(Object.keys(BASES) as Base[])
                  .filter((b) => d.beneficiary === 'EMPLOYEE' || b !== 'MALODGE_SHARE')
                  .map((b) => (
                    <option key={b} value={b}>
                      {b === 'FIXED' ? 'Montant fixe par unité vendue' : `Pourcentage ${BASES[b]}`}
                    </option>
                  ))}
              </Select>
            </Field>
            {d.base === 'FIXED' ? (
              <Field label="Montant par unité" hint="Dans la devise de la villa">
                <TextInput inputMode="decimal" value={d.amount} onChange={(e) => set('amount', e.target.value)} placeholder="50" />
              </Field>
            ) : (
              <Field label="Pourcentage (%)">
                <TextInput inputMode="decimal" value={d.rate} onChange={(e) => set('rate', e.target.value)} placeholder="30" />
              </Field>
            )}
          </div>
          <p className="text-[12.5px] text-ink-soft">
            Exemple : un extra vendu {formatMoney(ex.total, 'MAD')}, coût {formatMoney(ex.cost, 'MAD')} (marge {formatMoney(ex.margin, 'MAD')}
            {d.base === 'MALODGE_SHARE' ? `, part Malodge ${formatMoney(ex.malodge, 'MAD')} après un propriétaire à 50 %` : ''}) →{' '}
            <b className="text-ink">{formatMoney(ex.share, 'MAD')}</b> pour {d.beneficiary === 'OWNER' ? 'le propriétaire' : 'le salarié'}.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="À partir du" hint="Vide : depuis toujours">
            <TextInput type="date" value={d.validFrom} onChange={(e) => set('validFrom', e.target.value)} />
          </Field>
          <Field label="Jusqu’au" hint="Vide : sans fin">
            <TextInput type="date" value={d.validTo} onChange={(e) => set('validTo', e.target.value)} />
          </Field>
        </div>
        <Field label="Note (facultatif)">
          <TextInput value={d.note} onChange={(e) => set('note', e.target.value)} placeholder="Accord signé le…" />
        </Field>
      </div>
    </Modal>
  );
}

const draftOf = (r: Rule): RuleDraft => ({
  beneficiary: r.beneficiary,
  personId: r.person?.id ?? '',
  villaId: r.villa?.id ?? '',
  categoryId: r.category?.id ?? '',
  serviceId: r.service?.id ?? '',
  base: r.base,
  rate: r.rate != null ? String(Math.round(r.rate * 1000) / 10) : '',
  amount: r.amount != null ? String(r.amount) : '',
  validFrom: r.validFrom ?? '',
  validTo: r.validTo ?? '',
  note: r.note ?? '',
});

function RuleList({ who, rules, isAdmin, onEdit, onDelete }: { who: Who; rules: Rule[]; isAdmin: boolean; onEdit: (r: Rule) => void; onDelete: (r: Rule) => void }) {
  if (!rules.length)
    return <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-[13px] text-muted">Aucune règle : le taux habituel de chaque {who === 'OWNER' ? 'propriétaire' : 'salarié'} s’applique partout.</p>;
  return (
    <TableCard>
      <table className="w-full min-w-[820px]">
        <thead>
          <tr>
            <th className={th}>Pour</th>
            <th className={th}>Villa</th>
            <th className={th}>Extras visés</th>
            <th className={th}>Calcul</th>
            <th className={th}>Période</th>
            <th className={cn(th, 'text-right')}>S’applique à</th>
            <th className={th} />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...rules]
            .sort((a, b) => b.specificity - a.specificity)
            .map((r) => {
              const s = scope(r, who);
              return (
                <tr key={r.id} className={cn('hover:bg-surface-2/50', !r.activeToday && 'opacity-60')}>
                  <td className={td}>{s.person}</td>
                  <td className={td}>{s.villa}</td>
                  <td className={td}>{s.what}</td>
                  <td className={cn(td, 'font-semibold')}>
                    {r.description}
                    {r.note && <span className="block text-[11.5px] font-normal text-muted truncate max-w-[220px]">{r.note}</span>}
                    {r.conflicts.length > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11.5px] font-normal text-warning">
                        <CircleAlert size={12} /> Même cible qu’une autre règle sur la même période
                      </span>
                    )}
                  </td>
                  <td className={cn(td, 'text-ink-soft whitespace-nowrap')}>
                    {s.period}
                    {!r.activeToday && <span className="block text-[11.5px]">pas en cours</span>}
                  </td>
                  <td className={cn(td, 'text-right whitespace-nowrap')}>
                    {r.usage.count} extra{r.usage.count > 1 ? 's' : ''}
                    <span className="block text-[11.5px] text-muted">{formatMoney(Math.round(r.usage.share), 'MAD')}</span>
                  </td>
                  <td className={cn(td, 'text-right whitespace-nowrap')}>
                    {isAdmin && (
                      <>
                        <button type="button" onClick={() => onEdit(r)} className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label="Modifier">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => onDelete(r)} className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10" aria-label="Supprimer">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </TableCard>
  );
}

/** Management fee on the accommodation, per house (owner statements). */
function FeeRow({ h, isAdmin }: { h: Options['houses'][number]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [v, setV] = useState(String(Math.round(h.managementFeeRate * 1000) / 10));
  useEffect(() => setV(String(Math.round(h.managementFeeRate * 1000) / 10)), [h.managementFeeRate]);
  const save = useMutation({
    mutationFn: async (rate: number) => apiClient.patch(`/villas/${h.id}`, { managementFeeRate: rate }),
    onSuccess: () => {
      toast.success(`${h.name} : commission de gestion enregistrée`);
      qc.invalidateQueries({ queryKey: ['extras', 'commission-rules'] });
      qc.invalidateQueries({ queryKey: ['villa'] });
    },
  });
  const commit = () => {
    const n = num(v);
    if (n == null || n < 0 || n > 100) return setV(String(Math.round(h.managementFeeRate * 1000) / 10));
    if (Math.abs(n / 100 - h.managementFeeRate) > 1e-9) save.mutate(n / 100);
  };
  return (
    <tr className="hover:bg-surface-2/50">
      <td className={td}>
        <Link to={`/villas/${h.id}`} className="font-semibold hover:underline">
          {h.name}
        </Link>
        {!h.isActive && <span className="ml-1.5 text-[11.5px] text-muted">inactive</span>}
      </td>
      <td className={cn(td, 'text-ink-soft')}>{h.owner?.name ?? <span className="text-warning">Pas de propriétaire</span>}</td>
      <td className={cn(td, 'text-right')}>
        {isAdmin ? (
          <span className="inline-flex items-center gap-1.5">
            <TextInput
              inputMode="decimal"
              value={v}
              onChange={(e) => setV(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-20 h-8 text-right"
              aria-label={`Commission de gestion de ${h.name} (%)`}
            />
            %
          </span>
        ) : (
          pct(h.managementFeeRate)
        )}
      </td>
    </tr>
  );
}

export function CommissionsPanel({ preset }: { preset?: { villaId?: string } }) {
  const isAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(useAuthStore((s) => s.user?.role) ?? '');
  const qc = useQueryClient();
  const { data, isLoading } = useCommissionRules();
  const [who, setWho] = useState<Who>('OWNER');
  const [editing, setEditing] = useState<{ draft: RuleDraft; id?: string } | null>(null);
  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/extras/commission-rules/${id}`),
    onSuccess: () => {
      toast.success('Règle supprimée : les extras sont recalculés');
      qc.invalidateQueries({ queryKey: ['extras'] });
    },
  });
  const noRate = useMemo(() => (data ? (who === 'OWNER' ? data.options.owners : data.options.employees).filter((p) => p.rate == null) : []), [data, who]);

  if (isLoading || !data) return <Skeleton className="h-72 rounded-2xl" />;
  const rules = data.rules.filter((r) => r.beneficiary === who);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 text-[13px] text-ink-soft space-y-1.5">
        <p className="text-[14px] font-bold text-ink">Comment la commission d’un extra est calculée</p>
        <p>
          1. Chaque propriétaire et chaque salarié a un <b>taux habituel</b> (onglet « Personnes & taux ») : le propriétaire sur la marge, le salarié sur la part Malodge ou la marge.
        </p>
        <p>
          2. Une <b>règle</b> le remplace sur les extras qu’elle vise : une villa, une catégorie, une prestation, une personne, une période. Elle peut se calculer sur la marge, le prix
          payé par le client, la part Malodge (salariés) ou en montant fixe par unité.
        </p>
        <p>
          3. Si plusieurs règles visent un même extra, la plus précise l’emporte : prestation, puis catégorie, puis villa, puis personne. Tout l’historique est recalculé à chaque
          changement (suivi des extras, comptes, relevés propriétaires non envoyés).
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={who}
            onChange={setWho}
            options={[
              { value: 'OWNER', label: 'Propriétaires', count: data.rules.filter((r) => r.beneficiary === 'OWNER').length },
              { value: 'EMPLOYEE', label: 'Salariés', count: data.rules.filter((r) => r.beneficiary === 'EMPLOYEE').length },
            ]}
          />
          {isAdmin && (
            <Button className="ml-auto" icon={<Plus size={15} />} onClick={() => setEditing({ draft: { ...empty(who), villaId: preset?.villaId ?? '' } })}>
              Nouvelle règle
            </Button>
          )}
        </div>
        {noRate.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-xl bg-warning/10 px-3 py-2 text-[12.5px] text-ink-soft">
            <UserRound size={14} className="shrink-0 mt-0.5 text-warning" />
            <span>
              Sans taux habituel : <b>{noRate.map((p) => p.name).join(', ')}</b>. Leurs extras restent « à compléter » sauf là où une règle s’applique.
            </span>
          </p>
        )}
        <RuleList who={who} rules={rules} isAdmin={isAdmin} onEdit={(r) => setEditing({ draft: draftOf(r), id: r.id })} onDelete={(r) => window.confirm('Supprimer cette règle ? Les extras qu’elle visait reprennent le taux habituel.') && remove.mutate(r.id)} />
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[15px] font-bold text-ink flex items-center gap-2">
            <Home size={16} /> Commission de gestion sur l’hébergement
          </p>
          <p className="text-[12.5px] text-muted">Prélevée sur le chiffre d’affaires des nuits, dans les relevés propriétaires. Une villa et ses variantes Lodgify ont le même taux.</p>
        </div>
        <TableCard>
          <table className="w-full min-w-[520px]">
            <thead>
              <tr>
                <th className={th}>Villa</th>
                <th className={th}>Propriétaire</th>
                <th className={cn(th, 'text-right')}>Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.options.houses.map((h) => (
                <FeeRow key={h.id} h={h} isAdmin={isAdmin} />
              ))}
            </tbody>
          </table>
        </TableCard>
      </section>

      {editing && <RuleModal open onClose={() => setEditing(null)} initial={editing.draft} ruleId={editing.id} options={data.options} />}
    </div>
  );
}
