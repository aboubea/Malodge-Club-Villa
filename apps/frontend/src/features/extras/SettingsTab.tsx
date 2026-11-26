import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuthStore } from '../../store/authStore';
import { cn, formatDay } from '../../lib/utils';
import { Person, Stay, VillaRef, api, pct, toDateInput, useExtrasMutation, useExtrasSettings } from './api';
import { Field, IssueTag, Segmented, Select, TableCard, TextInput, td, th } from './ui';
import { ImportPanel } from './ImportPanel';

const ROLE_NAMES: Record<string, string> = { OWNER: 'Propriétaire', EMPLOYEE: 'Salarié', PROVIDER: 'Prestataire', CLIENT: 'Client' };

function PersonModal({ person, open, onClose, isAdmin }: { person: Person | null; open: boolean; onClose: () => void; isAdmin: boolean }) {
  const [f, setF] = useState({ role: 'PROVIDER', name: '', contact: '', rate: '', base: 'MALODGE_MARGIN', notes: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setF({
      role: person?.role ?? 'PROVIDER',
      name: person?.name ?? '',
      contact: person?.contact ?? '',
      rate: person?.commissionRate != null ? String(Math.round(person.commissionRate * 1000) / 10) : '',
      base: person?.commissionBase ?? 'MALODGE_MARGIN',
      notes: person?.notes ?? '',
    });
  }, [open, person]);
  const save = useExtrasMutation(api.savePerson, person ? 'Fiche mise à jour' : 'Fiche créée');
  const hasRate = f.role === 'OWNER' || f.role === 'EMPLOYEE';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setError('Nom requis.');
    const rate = f.rate.trim() === '' ? null : Number(f.rate.replace(',', '.')) / 100;
    if (rate !== null && (!(rate >= 0) || rate > 1)) return setError('Le taux doit être compris entre 0 et 100 %.');
    const body: Record<string, unknown> = { name: f.name.trim(), contact: f.contact.trim() || null, notes: f.notes.trim() || null };
    if (!person) body.role = f.role;
    if (hasRate && isAdmin) {
      body.commissionRate = rate;
      if (f.role === 'EMPLOYEE') body.commissionBase = f.base;
    }
    save.mutate({ id: person?.id, body }, { onSuccess: onClose });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={person ? `Modifier ${person.name}` : 'Nouvelle fiche'}
      description="Fiche interne, sans accès à l’application. Un accès peut être ouvert plus tard depuis Utilisateurs."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="person-form" loading={save.isPending}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <form id="person-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {!person && (
          <Field label="Type" className="sm:col-span-2">
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="PROVIDER">Prestataire</option>
              <option value="OWNER">Propriétaire</option>
              <option value="EMPLOYEE">Salarié</option>
            </Select>
          </Field>
        )}
        <Field label="Nom">
          <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} />
        </Field>
        <Field label="Contact">
          <TextInput value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} placeholder="Téléphone…" maxLength={120} />
        </Field>
        {hasRate && (
          <>
            <Field label="Commission (%)" hint={f.role === 'OWNER' ? 'Part de la marge totale.' : undefined}>
              <TextInput inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} disabled={!isAdmin} placeholder="—" />
            </Field>
            {f.role === 'EMPLOYEE' ? (
              <Field label="Base de la commission">
                <Select value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} disabled={!isAdmin}>
                  <option value="MALODGE_MARGIN">Marge Malodge (après propriétaire)</option>
                  <option value="TOTAL_MARGIN">Marge totale</option>
                </Select>
              </Field>
            ) : (
              <div />
            )}
            {!isAdmin && <p className="sm:col-span-2 text-[12px] text-muted -mt-2">Seul un administrateur peut modifier les taux.</p>}
          </>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <TextInput value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
        </Field>
        {error && <p className="sm:col-span-2 text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function StayModal({ stay, open, onClose, villas }: { stay: Stay | null; open: boolean; onClose: () => void; villas: { id: string; name: string }[] }) {
  const [f, setF] = useState({ label: '', villaId: '', checkIn: '', checkOut: '', archived: false, notes: '', confirmDates: false });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setF({
      label: stay?.label ?? '',
      villaId: stay?.villaId ?? '',
      checkIn: toDateInput(stay?.checkIn),
      checkOut: toDateInput(stay?.checkOut),
      archived: stay?.archived ?? false,
      notes: stay?.notes ?? '',
      confirmDates: false,
    });
  }, [open, stay]);
  const save = useExtrasMutation(api.saveStay, stay ? 'Séjour mis à jour' : 'Séjour créé');
  const estimated = !!stay?.datesEstimated;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.label.trim() || !f.villaId) return setError('Libellé et villa requis.');
    if (f.checkIn && f.checkOut && f.checkOut < f.checkIn) return setError('Le départ doit suivre l’arrivée.');
    save.mutate(
      {
        id: stay?.id,
        body: {
          label: f.label.trim(),
          villaId: f.villaId,
          checkIn: f.checkIn || null,
          checkOut: f.checkOut || null,
          archived: f.archived,
          notes: f.notes.trim() || null,
          ...(stay ? (estimated ? { datesEstimated: !f.confirmDates } : {}) : { datesEstimated: !f.checkIn || !f.checkOut }),
        },
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={stay ? 'Modifier le séjour' : 'Nouveau séjour'}
      description="Un voyageur qui revient = un nouveau libellé de séjour."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="stay-form" loading={save.isPending}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <form id="stay-form" onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Client / séjour">
          <TextInput value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Ex. Famille Martin — mai" maxLength={120} />
        </Field>
        <Field label="Villa">
          <Select value={f.villaId} onChange={(e) => setF({ ...f, villaId: e.target.value })}>
            <option value="">Choisir…</option>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Arrivée">
          <TextInput type="date" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} />
        </Field>
        <Field label="Départ">
          <TextInput type="date" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} />
        </Field>
        {estimated && (
          <label className="sm:col-span-2 flex items-start gap-2.5 rounded-xl bg-warning/5 border border-warning/25 px-3.5 py-3 text-[13px] text-ink-soft cursor-pointer">
            <input type="checkbox" checked={f.confirmDates} onChange={(e) => setF({ ...f, confirmDates: e.target.checked })} className="mt-0.5 w-4 h-4 accent-[rgb(var(--c-primary))]" />
            <span>
              <b className="text-ink">Dates à confirmer</b> — elles ont été déduites des extras lors de l’import. Corrigez-les si besoin, puis cochez pour les confirmer.
            </span>
          </label>
        )}
        <Field label="Notes" className="sm:col-span-2">
          <TextInput value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
        </Field>
        <label className="sm:col-span-2 flex items-center gap-2.5 text-[13px] text-ink-soft cursor-pointer">
          <input type="checkbox" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} className="w-4 h-4 accent-[rgb(var(--c-primary))]" />
          Archivé — le séjour quitte la vue d’ensemble ; ses extras et ses soldes sont conservés.
        </label>
        {error && <p className="sm:col-span-2 text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}

function MergeVillaModal({ villa, villas, onClose }: { villa: VillaRef | null; villas: VillaRef[]; onClose: () => void }) {
  const [targetId, setTargetId] = useState('');
  useEffect(() => {
    setTargetId(villa?.duplicates?.[0]?.id ?? '');
  }, [villa]);
  const merge = useExtrasMutation(api.mergeVilla, 'Villas rattachées');
  if (!villa) return null;
  const suggestions = villa.duplicates ?? [];
  const lodgify = villas.filter((v) => v.lodgify && !suggestions.some((d) => d.id === v.id));
  const others = villas.filter((v) => !v.lodgify && v.id !== villa.id);
  const target = villas.find((v) => v.id === targetId);
  return (
    <Modal
      open={!!villa}
      onClose={onClose}
      title={`Rattacher « ${villa.name} »`}
      description="Pour ne garder qu’une seule fiche par maison. Seules les données de l’application changent : rien n’est jamais modifié sur Lodgify."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!targetId} loading={merge.isPending} onClick={() => merge.mutate({ id: villa.id, targetId }, { onSuccess: onClose })}>
            Rattacher
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Villa à conserver">
          <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Choisir…</option>
            {suggestions.length > 0 && (
              <optgroup label="Doublons probables (Lodgify)">
                {suggestions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </optgroup>
            )}
            {lodgify.length > 0 && (
              <optgroup label="Autres villas Lodgify">
                {lodgify.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Autres villas">
                {others.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] text-ink-soft space-y-1">
          <p>
            {villa.stays ?? 0} séjour(s) et {villa.extras ?? 0} extra(s) de « {villa.name} » passeront sur{' '}
            <b className="text-ink">{target ? `« ${target.name} »` : 'la villa choisie'}</b>, avec son propriétaire et sa devise ({villa.currency}).
          </p>
          <p>« {villa.name} » sera ensuite supprimée de l’application, et un futur import de l’Excel se rattachera directement à la bonne villa.</p>
        </div>
      </div>
    </Modal>
  );
}

export function SettingsTab() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const { data, isLoading } = useExtrasSettings();
  const [section, setSection] = useState<'people' | 'stays' | 'villas' | 'import'>('people');
  const [person, setPerson] = useState<Person | null | 'new'>(null);
  const [stay, setStay] = useState<Stay | null | 'new'>(null);
  const [mergeVilla, setMergeVilla] = useState<VillaRef | null>(null);
  const [markup, setMarkup] = useState('');
  useEffect(() => {
    if (data) setMarkup(String(Math.round(data.markup * 1000) / 10));
  }, [data]);

  const saveVilla = useExtrasMutation(api.updateVilla, 'Villa mise à jour');
  const saveStay = useExtrasMutation(api.saveStay);
  const saveMarkup = useExtrasMutation((m: number) => api.setMarkup(m), 'Majoration enregistrée — catalogue mis à jour');

  if (isLoading || !data) return <Skeleton className="h-72 rounded-2xl" />;
  const owners = data.people.filter((p) => p.role === 'OWNER');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={section}
          onChange={setSection}
          options={[
            { value: 'people', label: 'Personnes & taux', count: data.people.filter((p) => p.issue).length },
            { value: 'stays', label: 'Séjours', count: data.stays.filter((s) => s.issue).length },
            { value: 'villas', label: 'Villas', count: data.villas.filter((v) => v.duplicates?.length).length },
            ...(isAdmin ? [{ value: 'import' as const, label: 'Import Excel' }] : []),
          ]}
        />
        {section === 'people' && (
          <Button className="ml-auto" icon={<Plus size={15} />} onClick={() => setPerson('new')}>
            Nouvelle fiche
          </Button>
        )}
        {section === 'stays' && (
          <Button className="ml-auto" icon={<Plus size={15} />} onClick={() => setStay('new')}>
            Nouveau séjour
          </Button>
        )}
      </div>

      {section === 'people' && (
        <TableCard>
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <th className={th}>Nom</th>
                <th className={th}>Type</th>
                <th className={th}>Commission</th>
                <th className={th}>Villas</th>
                <th className={th}>Accès appli</th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.people.map((p) => (
                <tr key={p.id} className="hover:bg-surface-2/50">
                  <td className={td}>
                    <p className="font-semibold">{p.name}</p>
                    {p.contact && <p className="text-[12px] text-muted">{p.contact}</p>}
                  </td>
                  <td className={cn(td, 'text-ink-soft')}>{ROLE_NAMES[p.role]}</td>
                  <td className={td}>
                    {p.role === 'PROVIDER' ? (
                      <span className="text-muted">—</span>
                    ) : p.commissionRate != null ? (
                      <span>
                        <b>{pct(p.commissionRate)}</b>
                        <span className="text-muted"> {p.role === 'OWNER' ? 'de la marge' : p.commissionBase === 'TOTAL_MARGIN' ? 'de la marge totale' : 'de la part Malodge'}</span>
                      </span>
                    ) : (
                      <IssueTag issue={p.issue} />
                    )}
                  </td>
                  <td className={cn(td, 'text-ink-soft')}>{p.villas.map((v) => v.name).join(', ') || '—'}</td>
                  <td className={td}>
                    <Badge variant={p.canLogin ? 'active' : 'inactive'}>{p.canLogin ? 'Oui' : 'Fiche'}</Badge>
                  </td>
                  <td className={cn(td, 'text-right')}>
                    <button type="button" onClick={() => setPerson(p)} className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label={`Modifier ${p.name}`}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {section === 'stays' && (
        <TableCard>
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <th className={th}>Client / séjour</th>
                <th className={th}>Villa</th>
                <th className={th}>Arrivée</th>
                <th className={th}>Départ</th>
                <th className={th}>Suivi</th>
                <th className={th} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.stays.map((s) => (
                <tr key={s.id} className={cn('hover:bg-surface-2/50', s.archived && 'opacity-60')}>
                  <td className={td}>
                    <p className="font-semibold">{s.label}</p>
                    {s.notes && <p className="text-[12px] text-muted truncate max-w-[320px]" title={s.notes}>{s.notes}</p>}
                  </td>
                  <td className={cn(td, 'text-ink-soft')}>{s.villa}</td>
                  <td className={cn(td, 'tabular text-ink-soft')}>{formatDay(s.checkIn)}</td>
                  <td className={cn(td, 'tabular text-ink-soft')}>
                    {formatDay(s.checkOut)} {s.issue && <IssueTag issue={s.issue} />}
                  </td>
                  <td className={td}>
                    <Badge variant={s.archived ? 'inactive' : 'active'}>{s.archived ? 'Archivé' : 'Actif'}</Badge>
                  </td>
                  <td className={cn(td, 'text-right whitespace-nowrap')}>
                    <button
                      type="button"
                      onClick={() => saveStay.mutate({ id: s.id, body: { label: s.label, villaId: s.villaId, archived: !s.archived } })}
                      className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
                      aria-label={s.archived ? 'Réactiver le séjour' : 'Archiver le séjour'}
                      title={s.archived ? 'Réactiver' : 'Archiver'}
                    >
                      {s.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                    <button type="button" onClick={() => setStay(s)} className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label={`Modifier ${s.label}`}>
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

      {section === 'villas' && (
        <div className="space-y-5">
          {data.villas.some((v) => v.duplicates?.length) && (
            <div className="rounded-2xl border border-warning/25 bg-warning/5 px-5 py-4 text-[13px] text-ink-soft">
              <b className="text-ink">{data.villas.filter((v) => v.duplicates?.length).length} villa(s) ressemblent à une villa Lodgify.</b> Rattachez-les pour ne garder
              qu’une fiche par maison : séjours, extras, propriétaire et devise sont reportés sur la villa Lodgify.
            </div>
          )}
          <TableCard>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className={th}>Villa / riad</th>
                  <th className={th}>Propriétaire</th>
                  <th className={th}>Devise des extras</th>
                  <th className={th} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.villas.map((v) => (
                  <tr key={v.id}>
                    <td className={td}>
                      <p className="font-semibold">
                        {v.name}
                        <span
                          className={cn(
                            'ml-2 align-middle inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-semibold',
                            v.lodgify ? 'bg-info/10 text-info' : 'bg-surface-2 text-muted',
                          )}
                        >
                          {v.lodgify ? 'Lodgify' : 'Saisie / Excel'}
                        </span>
                      </p>
                      <p className="text-[12px] text-muted">
                        {v.city}, {v.country} · {v.stays ?? 0} séjour(s) · {v.extras ?? 0} extra(s)
                      </p>
                      {!!v.duplicates?.length && (
                        <p className="text-[12px] text-warning font-semibold mt-0.5">
                          Doublon probable : {v.duplicates.map((d) => `« ${d.name} »`).join(' ou ')}
                        </p>
                      )}
                    </td>
                    <td className={td}>
                      <Select
                        value={v.ownerId ?? ''}
                        disabled={!isAdmin}
                        onChange={(e) => saveVilla.mutate({ id: v.id, body: { ownerId: e.target.value || null } })}
                        className="w-56"
                        aria-label={`Propriétaire de ${v.name}`}
                      >
                        <option value="">Aucun propriétaire</option>
                        {owners.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={td}>
                      <Select
                        value={v.currency}
                        disabled={!isAdmin}
                        onChange={(e) => saveVilla.mutate({ id: v.id, body: { currency: e.target.value } })}
                        className="w-28"
                        aria-label={`Devise de ${v.name}`}
                      >
                        {[...new Set(['MAD', 'EUR', v.currency])].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Select>
                    </td>
                    <td className={cn(td, 'text-right')}>
                      {isAdmin && !v.lodgify && (
                        <Button size="sm" variant={v.duplicates?.length ? 'primary' : 'secondary'} onClick={() => setMergeVilla(v)}>
                          Rattacher…
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          <div className="rounded-2xl bg-peach p-5 flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[220px]">
              <p className="text-[15px] font-bold text-ink">Majoration du catalogue</p>
              <p className="text-[12.5px] text-ink-soft mt-0.5">
                Appliquée au coût d’achat quand aucun prix public n’est saisi. Exemple : marge 400, propriétaire 50 % = 200 ; il reste 200 à Malodge ; salarié 10 % = 20 ; net Malodge 180.
              </p>
            </div>
            <Field label="Majoration (%)" className="w-36">
              <TextInput inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value)} disabled={!isAdmin} />
            </Field>
            {isAdmin && (
              <Button
                loading={saveMarkup.isPending}
                onClick={() => {
                  const m = Number(markup.replace(',', '.')) / 100;
                  if (Number.isFinite(m) && m >= 0) saveMarkup.mutate(m);
                }}
              >
                Enregistrer
              </Button>
            )}
          </div>
        </div>
      )}

      {section === 'import' && isAdmin && <ImportPanel />}

      <MergeVillaModal villa={mergeVilla} villas={data.villas} onClose={() => setMergeVilla(null)} />
      <PersonModal open={person !== null} person={person === 'new' ? null : person} onClose={() => setPerson(null)} isAdmin={isAdmin} />
      <StayModal open={stay !== null} stay={stay === 'new' ? null : stay} onClose={() => setStay(null)} villas={data.villas} />
    </div>
  );
}
