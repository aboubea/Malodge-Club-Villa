import { useEffect, useMemo, useState } from 'react';
import { MadEquivalent } from '../../lib/fx';
import { useSearchParams } from 'react-router-dom';
import { Pencil, Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/utils';
import { CatalogueItem, Options, api, pct, useCatalogue, useExtrasMutation } from './api';
import { EmptyState, Field, Money, Select, TableCard, TextInput, td, th } from './ui';
import { ColSpec, ColumnHeader, TableFilterSummary, useTableControls } from '../../components/ui/tableControls';

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** What each column sorts and filters on: the value shown in it. */
const CATALOGUE_COLS: ColSpec<CatalogueItem>[] = [
  { key: 'name', label: 'Prestation', value: (i) => i.name },
  { key: 'unit', label: 'Unité', value: (i) => i.unit },
  { key: 'unitCost', label: 'Coût unitaire', kind: 'number', align: 'right', value: (i) => i.unitCost },
  { key: 'publicPrice', label: 'Prix public saisi', kind: 'number', align: 'right', value: (i) => i.publicPrice },
  { key: 'proposedPrice', label: 'Prix proposé', kind: 'number', align: 'right', value: (i) => i.proposedPrice },
  { key: 'provider', label: 'Prestataire par défaut', value: (i) => i.defaultProvider?.name },
];

function CatalogueItemModal({ item, open, onClose, options, markup }: { item: CatalogueItem | null; open: boolean; onClose: () => void; options: Options | undefined; markup: number }) {
  const [f, setF] = useState({ name: '', category: '', unit: '', unitCost: '', publicPrice: '', currency: 'MAD', defaultProviderId: '', isActive: true });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setF({
      name: item?.name ?? '',
      category: item?.category ?? '',
      unit: item?.unit ?? '',
      unitCost: item?.unitCost?.toString() ?? '',
      publicPrice: item?.publicPrice?.toString() ?? '',
      currency: item?.currency ?? 'MAD',
      defaultProviderId: item?.defaultProvider?.id ?? '',
      isActive: item?.isActive ?? true,
    });
  }, [open, item]);
  const cost = num(f.unitCost);
  const pub = num(f.publicPrice);
  const proposed = pub ?? (cost !== null ? Math.round(cost * (1 + markup)) : null);
  const save = useExtrasMutation(api.saveCatalogueItem, item ? 'Prestation mise à jour' : 'Prestation ajoutée');
  const categories = useMemo(() => [...new Set((options?.catalogue ?? []).map((c) => c.category))].sort(), [options]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim() || !f.category.trim()) return setError('Nom et catégorie requis.');
    if (cost === null && pub === null) return setError('Renseignez un coût d’achat ou un prix public.');
    save.mutate(
      {
        id: item?.id,
        body: {
          name: f.name.trim(),
          category: f.category.trim(),
          unit: f.unit.trim() || null,
          unitCost: cost,
          publicPrice: pub,
          currency: f.currency,
          defaultProviderId: f.defaultProviderId || null,
          isActive: f.isActive,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={item ? 'Modifier la prestation' : 'Nouvelle prestation'}
      description={`Sans prix public saisi, le prix proposé = coût d’achat + ${pct(markup)}.`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted">
            Prix proposé : <Money value={proposed} currency={f.currency} className="font-bold text-ink" />
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" form="catalogue-form" loading={save.isPending}>
              Enregistrer
            </Button>
          </div>
        </div>
      }
    >
      <form id="catalogue-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Prestation" className="sm:col-span-2">
          <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={200} />
        </Field>
        <Field label="Catégorie">
          <TextInput list="extras-categories" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} maxLength={80} />
          <datalist id="extras-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Unité">
          <TextInput value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="par personne, par trajet…" maxLength={80} />
        </Field>
        <Field label="Coût d’achat unitaire" hint="Interne, jamais visible des clients.">
          <TextInput inputMode="decimal" value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} placeholder="—" />
        </Field>
        <Field label="Prix public saisi" hint="Laisser vide pour appliquer la majoration.">
          <TextInput inputMode="decimal" value={f.publicPrice} onChange={(e) => setF({ ...f, publicPrice: e.target.value })} placeholder="—" />
        </Field>
        <Field label="Prestataire par défaut">
          <Select value={f.defaultProviderId} onChange={(e) => setF({ ...f, defaultProviderId: e.target.value })}>
            <option value="">Aucun</option>
            {options?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Devise">
          <Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            {['MAD', 'EUR'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <label className="sm:col-span-2 flex items-center gap-2.5 text-[13px] text-ink-soft cursor-pointer">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="w-4 h-4 accent-[rgb(var(--c-primary))]" />
          Proposée à la saisie
        </label>
        {error && <p className="sm:col-span-2 text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

export function CatalogueTab({ options }: { options: Options | undefined }) {
  const { data, isLoading } = useCatalogue();
  // ?search= : opened from the global search (Ctrl+K).
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('search') ?? '');
  useEffect(() => setQ(params.get('search') ?? ''), [params]);
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<CatalogueItem | null | 'new'>(null);

  const categories = useMemo(() => [...new Set((data?.items ?? []).map((i) => i.category))].sort(), [data]);
  const items = (data?.items ?? []).filter(
    (i) => (!cat || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())),
  );
  // Sort and filter at the top of the columns (as in the Excel file).
  const ctl = useTableControls<CatalogueItem>('extras-catalogue', items, CATALOGUE_COLS);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <TextInput className="pl-10" placeholder="Rechercher une prestation" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-56" aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <p className="text-[12.5px] text-muted">
          Majoration appliquée sans prix public : <b className="text-ink">{pct(data?.markup)}</b>
        </p>
        <Button className="ml-auto" icon={<Plus size={15} />} onClick={() => setEditing('new')}>
          Ajouter une prestation
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState title="Aucune prestation" />
        </div>
      ) : (
        <>
        <TableFilterSummary ctl={ctl} noun="prestation" />
        <TableCard>
          <table className="w-full min-w-[920px]">
            <thead>
              <tr>
                <th className={th}><ColumnHeader ctl={ctl} col="name" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="unit" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="unitCost" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="publicPrice" /></th>
                <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="proposedPrice" /></th>
                <th className={th}><ColumnHeader ctl={ctl} col="provider" /></th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ctl.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className={cn(td, 'text-center text-muted')}>
                    Aucune prestation ne correspond aux filtres.
                  </td>
                </tr>
              )}
              {ctl.rows.map((i) => (
                <tr key={i.id} className={cn('hover:bg-surface-2/50', !i.isActive && 'opacity-55')}>
                  <td className={td}>
                    <p className="font-semibold max-w-[380px] truncate" title={i.name}>
                      {i.name}
                    </p>
                    <p className="text-[12px] text-muted">{i.category}</p>
                  </td>
                  <td className={cn(td, 'text-ink-soft')}>{i.unit ?? '—'}</td>
                  <td className={cn(td, 'text-right text-ink-soft')}>
                    <Money value={i.unitCost} currency={i.currency} />
                  </td>
                  <td className={cn(td, 'text-right text-ink-soft')}>
                    <Money value={i.publicPrice} currency={i.currency} />
                  </td>
                  <td className={cn(td, 'text-right font-semibold')}>
                    <Money value={i.proposedPrice} currency={i.currency} />
                    <MadEquivalent amount={i.proposedPrice} currency={i.currency} className="block text-[11px] font-normal text-muted" />
                    {i.publicPrice == null && i.unitCost != null && <span className="block text-[11px] font-normal text-muted">coût + {pct(data?.markup)}</span>}
                  </td>
                  <td className={cn(td, 'text-ink-soft')}>{i.defaultProvider?.name ?? '—'}</td>
                  <td className={cn(td, 'text-right')}>
                    <button type="button" onClick={() => setEditing(i)} className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label={`Modifier ${i.name}`}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
        </>
      )}

      <CatalogueItemModal
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        options={options}
        markup={data?.markup ?? 0.25}
      />
    </div>
  );
}
