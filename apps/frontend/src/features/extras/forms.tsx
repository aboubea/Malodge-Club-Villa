import { useEffect, useMemo, useState } from 'react';
import { fxRate, useFx } from '../../lib/fx';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';
import { formatMoney, todayInput } from '../../lib/utils';
import {
  AccountRole,
  ExtraLine,
  ExtraStatus,
  METHOD_LABELS,
  Options,
  STATUS_LABELS,
  api,
  toDateInput,
  useAccounts,
  useExtrasMutation,
} from './api';
import { Field, Select, TextArea, TextInput } from './ui';

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/* ───────────────────────────────── Extra ───────────────────────────────── */

export function ExtraFormModal({
  open,
  onClose,
  options,
  extra,
  defaultStayId,
}: {
  open: boolean;
  onClose: () => void;
  options: Options | undefined;
  extra?: ExtraLine | null;
  defaultStayId?: string;
}) {
  const empty = {
    stayId: defaultStayId ?? '',
    villaId: '',
    serviceId: '',
    label: '',
    providerId: '',
    sellerId: '',
    date: todayInput(),
    quantity: '1',
    unitPrice: '',
    unitCost: '',
    status: 'CONFIRMED' as ExtraStatus,
    notes: '',
  };
  const [form, setForm] = useState(empty);
  const [offCatalogue, setOffCatalogue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (extra) {
      setForm({
        stayId: extra.stay?.id ?? '',
        villaId: extra.villa && options?.stays.find((s) => s.id === extra.stay?.id)?.villaId !== extra.villa.id ? extra.villa.id : '',
        serviceId: extra.serviceId ?? '',
        label: extra.serviceId ? '' : extra.label,
        providerId: extra.provider?.id ?? '',
        sellerId: extra.seller?.id ?? '',
        date: toDateInput(extra.date),
        quantity: extra.quantity?.toString() ?? '',
        unitPrice: extra.unitPrice?.toString() ?? '',
        unitCost: extra.unitCost?.toString() ?? '',
        status: extra.status,
        notes: extra.notes ?? '',
      });
      setOffCatalogue(!extra.serviceId);
    } else {
      setForm({ ...empty, stayId: defaultStayId ?? '' });
      setOffCatalogue(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extra?.id]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const stay = options?.stays.find((s) => s.id === form.stayId);
  const villa = options?.villas.find((v) => v.id === (form.villaId || stay?.villaId));
  const currency = villa?.currency ?? 'MAD';

  const catalogue = useMemo(() => {
    // Every catalogue item, whatever its currency: one priced in euros is converted to the villa's currency when picked.
    const items = options?.catalogue ?? [];
    const byCat = new Map<string, typeof items>();
    for (const i of items) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i]);
    return [...byCat.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [options?.catalogue, villa]);

  const { data: fx } = useFx();
  const [convertedFrom, setConvertedFrom] = useState<string | null>(null);
  const pickService = (id: string) => {
    const item = options?.catalogue.find((c) => c.id === id);
    // A price in another currency (euros) is converted at today's rate into the villa's currency.
    const r = item ? fxRate(fx, item.currency, currency) : 1;
    const conv = (v: number | null | undefined) => (v == null || r == null ? null : String(Math.round(v * r * 100) / 100));
    setConvertedFrom(item && item.currency !== currency && r != null ? `${item.currency} → ${currency} au taux du ${fx?.date ?? 'jour'} (1 ${item.currency} = ${r.toFixed(4)} ${currency})` : null);
    setForm((f) => ({
      ...f,
      serviceId: id,
      unitPrice: conv(item?.proposedPrice) ?? f.unitPrice,
      unitCost: conv(item?.unitCost) ?? f.unitCost,
      providerId: f.providerId || item?.defaultProvider?.id || '',
    }));
  };

  const qty = num(form.quantity);
  const price = num(form.unitPrice);
  const cost = num(form.unitCost);
  const total = qty !== null && price !== null ? qty * price : null;
  const totalCost = qty !== null && cost !== null ? qty * cost : null;
  const margin = total !== null && totalCost !== null ? total - totalCost : null;

  const save = useExtrasMutation(api.saveExtra, extra ? 'Extra mis à jour' : 'Extra ajouté');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.stayId) return setError('Choisissez un séjour.');
    if (!offCatalogue && !form.serviceId) return setError('Choisissez une prestation, ou passez en « hors catalogue ».');
    if (offCatalogue && !form.label.trim()) return setError('Décrivez la prestation.');
    if (qty === null || qty <= 0) return setError('La quantité doit être supérieure à 0.');
    setError(null);
    save.mutate(
      {
        id: extra?.id,
        body: {
          stayId: form.stayId,
          villaId: form.villaId || null,
          serviceId: offCatalogue ? null : form.serviceId,
          label: offCatalogue ? form.label.trim() : null,
          providerId: form.providerId || null,
          sellerId: form.sellerId || null,
          date: form.date || null,
          quantity: qty,
          unitPrice: price,
          unitCost: cost,
          status: form.status,
          notes: form.notes.trim() || null,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={extra ? "Modifier l'extra" : 'Nouvel extra'}
      description="Quantité, prix et coût sont proposés par le catalogue et restent modifiables."
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-muted tabular">
            Total <b className="text-ink">{formatMoney(total, currency)}</b> · Marge{' '}
            <b className={margin !== null && margin < 0 ? 'text-danger' : 'text-ink'}>{formatMoney(margin, currency)}</b>
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" form="extra-form" loading={save.isPending}>
              {extra ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="extra-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Client / séjour" className="sm:col-span-2">
          <Select value={form.stayId} onChange={(e) => set('stayId', e.target.value)} required>
            <option value="">Choisir un séjour…</option>
            {options?.stays.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.villa}
                {s.archived ? ' (archivé)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Prestation"
          className="sm:col-span-2"
          hint={
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setOffCatalogue((v) => !v)}>
              {offCatalogue ? 'Choisir dans le catalogue' : 'Prestation hors catalogue'}
            </button>
          }
        >
          {offCatalogue ? (
            <TextInput value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Ex. Location de frigo" maxLength={200} />
          ) : (
            <Select value={form.serviceId} onChange={(e) => pickService(e.target.value)}>
              <option value="">Choisir une prestation…</option>
              {catalogue.map(([cat, items]) => (
                <optgroup key={cat} label={cat}>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.proposedPrice != null ? ` — ${formatMoney(i.proposedPrice, i.currency)}${i.currency !== currency ? ' (converti)' : ''}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Date">
          <TextInput type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Statut">
          <Select value={form.status} onChange={(e) => set('status', e.target.value as ExtraStatus)}>
            {(Object.keys(STATUS_LABELS) as ExtraStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2 grid grid-cols-3 gap-4">
          <Field label="Quantité">
            <TextInput inputMode="decimal" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </Field>
          <Field label={`Vente / unité (${currency})`}>
            <TextInput inputMode="decimal" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} placeholder="—" />
          </Field>
          <Field label={`Achat / unité (${currency})`}>
            <TextInput inputMode="decimal" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} placeholder="—" />
          </Field>
          {convertedFrom && <p className="col-span-3 -mt-2 text-[12px] text-muted">Prix du catalogue converti : {convertedFrom}.</p>}
        </div>

        <Field label="Prestataire">
          <Select value={form.providerId} onChange={(e) => set('providerId', e.target.value)}>
            <option value="">Aucun</option>
            {options?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vendeur (salarié)" hint="Sa commission est calculée selon son taux.">
          <Select value={form.sellerId} onChange={(e) => set('sellerId', e.target.value)}>
            <option value="">Aucun</option>
            {options?.sellers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Villa" hint="Par défaut, la villa du séjour.">
          <Select value={form.villaId} onChange={(e) => set('villaId', e.target.value)}>
            <option value="">{stay ? `Villa du séjour (${stay.villa})` : 'Villa du séjour'}</option>
            {options?.villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note">
          <TextInput value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Facultatif" maxLength={1000} />
        </Field>

        {error && <p className="sm:col-span-2 text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

/* ─────────────────────────────── Settlement ─────────────────────────────── */

export interface SettlementPreset {
  kind?: string;
  accountId?: string; // stay id for clients, user id otherwise
  currency?: string;
}

export function SettlementFormModal({
  open,
  onClose,
  options,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  options: Options | undefined;
  preset?: SettlementPreset | null;
}) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const [form, setForm] = useState({
    kind: 'CLIENT_PAYMENT',
    accountId: '',
    date: todayInput(),
    amount: '',
    currency: 'MAD',
    method: 'CASH',
    reference: '',
    note: '',
    validate: false,
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm((f) => ({
      ...f,
      kind: preset?.kind ?? 'CLIENT_PAYMENT',
      accountId: preset?.accountId ?? '',
      currency: preset?.currency ?? 'MAD',
      amount: '',
      reference: '',
      note: '',
      validate: false,
      date: todayInput(),
    }));
  }, [open, preset]);

  const kindDef = options?.settlementKinds.find((k) => k.kind === form.kind);
  const role: AccountRole = kindDef?.role ?? 'CLIENT';
  const { data: accounts } = useAccounts(role);
  const people =
    role === 'CLIENT'
      ? (options?.stays ?? []).map((s) => ({ id: s.id, name: `${s.label} · ${s.villa}${s.archived ? ' (archivé)' : ''}`, currency: s.currency }))
      : (role === 'PROVIDER' ? options?.providers : role === 'OWNER' ? options?.owners : options?.sellers)?.map((p) => ({ ...p, currency: undefined })) ?? [];

  const selected = people.find((p) => p.id === form.accountId);
  const currency = role === 'CLIENT' ? selected?.currency ?? form.currency : form.currency;
  const account = accounts?.find((a) => a.id === form.accountId && a.currency === currency);
  // As in the spreadsheet: propose the outstanding balance, or half of it.
  const suggested = account ? Math.max(0, kindDef?.balance === -1 ? -account.balance : account.balance) : 0;

  const create = useExtrasMutation(api.createSettlement, 'Règlement enregistré');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = num(form.amount);
    if (!form.accountId) return setError('Choisissez la personne ou le séjour.');
    if (amount === null || !(amount > 0)) return setError('Le montant doit être supérieur à 0.');
    if (form.validate && !form.date) return setError('Une date est nécessaire pour valider.');
    setError(null);
    create.mutate(
      {
        kind: form.kind,
        personId: form.accountId,
        reservationId: role === 'CLIENT' ? form.accountId : null,
        date: form.date || null,
        amount,
        currency,
        method: form.method || null,
        reference: form.reference.trim() || null,
        note: form.note.trim() || null,
        validate: isAdmin && form.validate,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Enregistrer un règlement"
      description={isAdmin ? 'Un règlement ne modifie les soldes qu’une fois validé.' : 'Un administrateur validera ce règlement avant qu’il ne modifie les soldes.'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="settlement-form" loading={create.isPending}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <form id="settlement-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Opération">
          <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value, accountId: '' }))}>
            {options?.settlementKinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={role === 'CLIENT' ? 'Client / séjour' : 'Personne'}>
          <Select value={form.accountId} onChange={(e) => set('accountId', e.target.value)}>
            <option value="">Choisir…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Date du paiement">
          <TextInput type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Mode">
          <Select value={form.method} onChange={(e) => set('method', e.target.value)}>
            {Object.entries(METHOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={`Montant (${currency})`}
          className="sm:col-span-2"
          hint={
            account ? (
              <span className="flex flex-wrap items-center gap-2">
                Solde du compte : <b className="text-ink">{formatMoney(account.balance, currency)}</b>
                {suggested > 0 && (
                  <>
                    <button type="button" className="h-6 px-2.5 rounded-full bg-surface-2 text-ink font-semibold hover:bg-line" onClick={() => set('amount', String(suggested))}>
                      Solde {formatMoney(suggested, currency)}
                    </button>
                    <button type="button" className="h-6 px-2.5 rounded-full bg-surface-2 text-ink font-semibold hover:bg-line" onClick={() => set('amount', String(Math.round((suggested / 2) * 100) / 100))}>
                      Moitié {formatMoney(suggested / 2, currency)}
                    </button>
                  </>
                )}
              </span>
            ) : undefined
          }
        >
          <div className="flex gap-2">
            <TextInput inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" className="flex-1" />
            {role !== 'CLIENT' && (
              <Select value={form.currency} onChange={(e) => set('currency', e.target.value)} className="w-24">
                {['MAD', 'EUR'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </div>
        </Field>

        <Field label="Référence">
          <TextInput value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Facultatif" maxLength={120} />
        </Field>
        <Field label="Note">
          <TextInput value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Facultatif" maxLength={1000} />
        </Field>

        {isAdmin && (
          <label className="sm:col-span-2 flex items-center gap-2.5 text-[13px] text-ink-soft cursor-pointer select-none">
            <input type="checkbox" checked={form.validate} onChange={(e) => set('validate', e.target.checked)} className="w-4 h-4 accent-[rgb(var(--c-primary))]" />
            Valider immédiatement
          </label>
        )}
        {error && <p className="sm:col-span-2 text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

