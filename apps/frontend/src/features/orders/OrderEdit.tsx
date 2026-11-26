import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ExtraFormModal } from '../extras/forms';
import { type ExtraLine, useExtrasOptions } from '../extras/api';

/**
 * "Modifier" on an order: the extras form (date, service, provider, quantity,
 * price, cost, status, seller, notes), the same as in Suivi des extras.
 */
export function OrderEdit({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { data: lines = [] } = useQuery({
    queryKey: ['extras', 'order-lines', orderId],
    queryFn: async () => {
      const r = await apiClient.get('/extras/lines', { params: { orderId, stays: 'all' } });
      return ((r.data?.data ?? r.data)?.lines ?? []) as ExtraLine[];
    },
  });
  const { data: options } = useExtrasOptions();
  const [editing, setEditing] = useState<ExtraLine | null>(null);
  const [picking, setPicking] = useState(false);
  if (!lines.length) return null;

  return (
    <>
      <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => (lines.length === 1 ? setEditing(lines[0]) : setPicking(true))}>
        Modifier
      </Button>
      <Modal open={picking} onClose={() => setPicking(false)} title="Quelle prestation modifier ?" size="md">
        <div className="space-y-2">
          {lines.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setPicking(false);
                setEditing(l);
              }}
              className="w-full text-left rounded-xl border border-line px-4 py-3 hover:border-line-strong"
            >
              <p className="text-[13.5px] font-semibold text-ink">{l.label}</p>
              <p className="text-[12px] text-muted">
                {l.quantity ?? '—'} × {l.unitPrice ?? '—'} {l.currency}
              </p>
            </button>
          ))}
        </div>
      </Modal>
      <ExtraFormModal
        open={!!editing}
        extra={editing}
        options={options}
        onClose={() => {
          setEditing(null);
          for (const k of [['order', orderId], ['orders'], ['extras']]) qc.invalidateQueries({ queryKey: k });
        }}
      />
    </>
  );
}
