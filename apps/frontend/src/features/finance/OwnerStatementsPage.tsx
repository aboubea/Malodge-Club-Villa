import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileText, Mail, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn, formatMoney } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ColSpec, ColumnHeader, TableFilterSummary, useTableControls } from '../../components/ui/tableControls';

interface Totals {
  nights: number;
  gross: number;
  fee: number;
  net: number;
  /** The owner's share of the extras realised in his villas. */
  extras: number;
  /** Realised extras of his villas in the month, and what they were sold (absent on older statements). */
  extrasCount?: number;
  extrasSold?: number;
  /** Extras of the month not added to his share (rate or cost missing, not realised yet). */
  extrasNotCounted?: number;
  due: number;
  paid: number;
  remaining: number;
}
interface Row {
  id: string;
  month: string;
  status: 'DRAFT' | 'SENT';
  owner: { id: string; name: string; email: string | null; phone: string | null };
  houses: string[];
  totals: Totals;
  warnings: string[];
  sentAt: string | null;
  sentTo: string | null;
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const mad = (n: number) => formatMoney(Math.round(n) || 0, 'MAD');
const minus = (n: number) => (n ? -n : 0);
const previousMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** What each column sorts and filters on: the amounts in whole dirhams, as shown (the commission negative). */
const STATEMENT_COLS: ColSpec<Row>[] = [
  { key: 'owner', label: 'Propriétaire', value: (r) => r.owner.name },
  { key: 'nights', label: 'Nuits', kind: 'number', align: 'right', value: (r) => r.totals.nights },
  { key: 'gross', label: 'CA héb.', kind: 'number', align: 'right', value: (r) => Math.round(r.totals.gross) || 0 },
  { key: 'fee', label: 'Commission', kind: 'number', align: 'right', value: (r) => Math.round(minus(r.totals.fee)) || 0 },
  { key: 'extras', label: 'Part extras', kind: 'number', align: 'right', value: (r) => Math.round(r.totals.extras) || 0 },
  { key: 'due', label: 'Total dû', kind: 'number', align: 'right', value: (r) => Math.round(r.totals.due) || 0 },
  { key: 'paid', label: 'Déjà versé', kind: 'number', align: 'right', value: (r) => Math.round(r.totals.paid) || 0 },
  { key: 'remaining', label: 'Reste', kind: 'number', align: 'right', value: (r) => Math.round(r.totals.remaining) || 0 },
  { key: 'status', label: 'Statut', value: (r) => (r.status === 'SENT' ? 'Envoyé' : 'Brouillon') },
];

async function fetchPdf(id: string) {
  const res = await apiClient.get(`/owner-statements/${id}/pdf`, { responseType: 'blob', timeout: 60_000 });
  return URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
}

/** A statement shown in the page, with download. */
function PdfPreview({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!row) return;
    let revoked: string | null = null;
    setUrl(null);
    fetchPdf(row.id)
      .then((u) => {
        revoked = u;
        setUrl(u);
      })
      .catch(() => toast.error('PDF indisponible'));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [row?.id]);
  if (!row) return null;
  return (
    <Modal open={!!row} onClose={onClose} title={`Relevé de ${monthLabel(row.month)} — ${row.owner.name}`} size="xl">
      <div className="space-y-3">
        {url ? <iframe title="Relevé PDF" src={url} className="w-full h-[70vh] rounded-xl border border-line bg-white" /> : <Skeleton className="w-full h-[70vh] rounded-xl" />}
        {url && (
          <a href={url} download={`releve-${row.month}-${row.owner.name}.pdf`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline">
            <Download size={14} /> Télécharger le PDF
          </a>
        )}
      </div>
    </Modal>
  );
}

/** Owners' monthly statements: prepared on the 1st, checked here, then sent. */
export function OwnerStatementsPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(previousMonth());
  const [preview, setPreview] = useState<Row | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['owner-statements', month],
    queryFn: async () => {
      const r = await apiClient.get('/owner-statements', { params: { month } });
      return (r.data?.data ?? r.data) as Row[];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['owner-statements', month] });
  const errorOf = (e: any) => e?.response?.data?.message || 'Action impossible';

  const prepare = useMutation({
    mutationFn: () => apiClient.post('/owner-statements/prepare', { month }, { timeout: 120_000 }),
    onSuccess: (r) => {
      const d = r.data?.data ?? r.data;
      toast.success(`${d.prepared} relevé(s) préparé(s)${d.alreadySent ? `, ${d.alreadySent} déjà envoyé(s) laissé(s) tels quels` : ''}`);
      refresh();
    },
    onError: (e) => toast.error(errorOf(e)),
  });
  const recompute = useMutation({
    mutationFn: (id: string) => apiClient.post(`/owner-statements/${id}/recompute`),
    onSuccess: () => {
      toast.success('Relevé recalculé');
      refresh();
    },
    onError: (e) => toast.error(errorOf(e)),
  });
  const send = useMutation({
    mutationFn: (id: string) => apiClient.post(`/owner-statements/${id}/send`, {}, { timeout: 60_000 }),
    onSuccess: (r) => {
      toast.success(`Relevé envoyé à ${(r.data?.data ?? r.data).to}`);
      refresh();
    },
    onError: (e) => toast.error(errorOf(e)),
  });
  const markSent = useMutation({
    mutationFn: (id: string) => apiClient.post(`/owner-statements/${id}/mark-sent`, { how: 'remis par WhatsApp ou en main propre' }),
    onSuccess: () => {
      toast.success('Relevé marqué comme remis');
      refresh();
    },
    onError: (e) => toast.error(errorOf(e)),
  });
  const sendAll = useMutation({
    mutationFn: () => apiClient.post('/owner-statements/send-all', { month }, { timeout: 180_000 }),
    onSuccess: (r) => {
      const d = r.data?.data ?? r.data;
      toast.success(`${d.sent} relevé(s) envoyé(s)${d.noEmail.length ? ` · sans e-mail : ${d.noEmail.join(', ')}` : ''}`);
      d.failed.forEach((f: { owner: string; error: string }) => toast.error(`${f.owner} : ${f.error}`));
      refresh();
    },
    onError: (e) => toast.error(errorOf(e)),
  });

  // Sort and filter at the top of the columns (as in Excel). Sending the drafts still covers the whole month.
  const ctl = useTableControls<Row>('owner-statements', data, STATEMENT_COLS);
  const drafts = data.filter((r) => r.status === 'DRAFT');
  const sendable = drafts.filter((r) => r.owner.email).length;
  const th = 'px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap';
  const td = 'px-3 py-2.5 text-[13px] text-ink tabular whitespace-nowrap text-right';

  return (
    <div className="space-y-5 max-w-[1400px]">
      <PageHeader
        title="Relevés propriétaires"
        description="Préparés le 1er de chaque mois pour le mois écoulé. Vérifiez-les, puis envoyez-les : un relevé envoyé ne change plus."
      >
        <Button variant="secondary" icon={<RefreshCw size={14} className={prepare.isPending ? 'animate-spin' : ''} />} loading={prepare.isPending} onClick={() => prepare.mutate()}>
          Préparer / recalculer
        </Button>
        <Button icon={<Send size={14} />} disabled={!sendable} loading={sendAll.isPending} onClick={() => sendAll.mutate()}>
          Envoyer les brouillons ({sendable})
        </Button>
      </PageHeader>

      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label="Mois précédent">
          <ChevronLeft size={16} />
        </button>
        <p className="text-[15px] font-bold text-ink min-w-[160px] text-center first-letter:uppercase">{monthLabel(month)}</p>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label="Mois suivant">
          <ChevronRight size={16} />
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center">
          <FileText size={22} className="mx-auto text-muted" />
          <p className="mt-2 text-[14px] font-semibold text-ink">Aucun relevé pour {monthLabel(month)}</p>
          <p className="mt-1 text-[13px] text-muted">Cliquez sur « Préparer » : un relevé est créé pour chaque propriétaire qui a eu des nuits, des extras ou un versement ce mois-là.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <TableFilterSummary ctl={ctl} noun="relevé" />
          <section className="rounded-2xl border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}><ColumnHeader ctl={ctl} col="owner" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="nights" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="gross" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="fee" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="extras" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="due" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="paid" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="remaining" /></th>
                  <th className={th}><ColumnHeader ctl={ctl} col="status" /></th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ctl.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2.5 text-[13px] max-w-[290px]">
                      <p className="font-semibold text-ink">{r.owner.name}</p>
                      <p className="text-[11.5px] text-muted truncate">{r.houses.join(', ')}</p>
                      <p className={cn('text-[11.5px]', r.owner.email ? 'text-muted' : 'text-warning')}>{r.owner.email ?? 'pas d’e-mail : à remettre autrement'}</p>
                      {r.warnings.length > 0 && (
                        <ul className="mt-1.5 space-y-1">
                          {r.warnings.map((w) => (
                            <li key={w} className="flex items-start gap-1 text-[11.5px] leading-snug text-warning whitespace-normal">
                              <TriangleAlert size={12} className="shrink-0 mt-0.5" /> {w}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={td}>{r.totals.nights}</td>
                    <td className={td}>{mad(r.totals.gross)}</td>
                    <td className={td}>{mad(minus(r.totals.fee))}</td>
                    <td className={td}>
                      {mad(r.totals.extras)}
                      {r.totals.extrasCount != null && r.totals.extrasCount > 0 && (
                        <span className="block text-[11px] text-muted whitespace-nowrap">
                          sur {r.totals.extrasCount} extra{r.totals.extrasCount > 1 ? 's' : ''} · {mad(r.totals.extrasSold ?? 0)} vendus
                        </span>
                      )}
                      {(r.totals.extrasNotCounted ?? 0) > 0 && (
                        <span className="block text-[11px] text-warning whitespace-nowrap">
                          {r.totals.extrasNotCounted} non compté{r.totals.extrasNotCounted! > 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    <td className={cn(td, 'font-semibold')}>{mad(r.totals.due)}</td>
                    <td className={td}>{mad(r.totals.paid)}</td>
                    <td className={cn(td, 'font-bold')}>{mad(r.totals.remaining)}</td>
                    <td className="px-3 py-2.5 text-[12.5px] whitespace-nowrap">
                      {r.status === 'SENT' ? (
                        <span className="inline-flex items-center gap-1 text-success font-semibold" title={r.sentTo ?? ''}>
                          <CheckCircle2 size={14} /> Envoyé le {new Date(r.sentAt!).toLocaleDateString('fr-FR')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-peach text-ink text-[12px] font-semibold">Brouillon</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <div className="inline-flex gap-1.5">
                        <button type="button" onClick={() => setPreview(r)} title="Voir le PDF" aria-label="Voir le PDF" className="w-8 h-8 rounded-full inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                          <Eye size={15} />
                        </button>
                        {r.status === 'DRAFT' && (
                          <>
                            <button
                              type="button"
                              onClick={() => recompute.mutate(r.id)}
                              title="Recalculer"
                              aria-label="Recalculer"
                              className="w-8 h-8 rounded-full inline-flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
                            >
                              <RefreshCw size={15} className={recompute.isPending && recompute.variables === r.id ? 'animate-spin' : ''} />
                            </button>
                            {r.owner.email ? (
                              <Button size="sm" icon={<Mail size={13} />} loading={send.isPending && send.variables === r.id} onClick={() => send.mutate(r.id)}>
                                Envoyer
                              </Button>
                            ) : (
                              <Button size="sm" variant="secondary" icon={<CheckCircle2 size={13} />} onClick={() => markSent.mutate(r.id)}>
                                Marquer remis
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      <p className="text-[12px] text-muted">
        Chaque séjour compte pour ses nuits du mois ; la commission de gestion est celle de la villa (fiche villa). Les montants en euros sont convertis au taux du jour de la
        préparation. Le 1er de chaque mois, les brouillons du mois écoulé sont préparés automatiquement.
      </p>
      <PdfPreview row={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

/** For an owner: their statements already sent, to download. */
export function MyStatements() {
  const { data = [] } = useQuery({
    queryKey: ['owner-statements', 'mine'],
    queryFn: async () => {
      const r = await apiClient.get('/owner-statements/mine');
      return (r.data?.data ?? r.data) as { id: string; month: string; monthLabel: string; totalDue: number; sentAt: string }[];
    },
  });
  if (!data.length) return null;
  const open = async (id: string, month: string) => {
    try {
      const url = await fetchPdf(id);
      const a = document.createElement('a');
      a.href = url;
      a.download = `releve-${month}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error('PDF indisponible');
    }
  };
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-[15px] font-bold text-ink mb-2">Mes relevés mensuels</h2>
      <ul className="divide-y divide-line">
        {data.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[13.5px] text-ink first-letter:uppercase">{s.monthLabel}</span>
            <span className="flex items-center gap-3">
              <span className="text-[13px] font-semibold text-ink tabular">{mad(s.totalDue)}</span>
              <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={() => open(s.id, s.month)}>
                PDF
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
