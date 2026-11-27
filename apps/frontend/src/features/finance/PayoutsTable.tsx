import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ColSpec, ColumnHeader, TableFilterSummary, useTableControls } from '../../components/ui/tableControls';
import { formatCurrency } from '../../lib/utils';

export interface PayoutRow {
  id: string;          // providerId or villaId
  name: string;
  grossAmount: number;
  commission?: number;
  managementFee?: number;
  netAmount: number;
  orderCount?: number;
  stayCount?: number;
  status?: 'pending' | 'paid';
}

interface PayoutsTableProps {
  type: 'provider' | 'owner';
  data: PayoutRow[];
  onMarkPaid?: (id: string) => void;
  /** Every row is in this currency (rows of other currencies are shown separately). */
  currency?: string;
}

export function PayoutsTable({ type, data, onMarkPaid, currency = 'EUR' }: PayoutsTableProps) {
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

  function handleMarkPaid(id: string) {
    setPaidIds((prev) => new Set([...prev, id]));
    onMarkPaid?.(id);
  }

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted">
        Aucun reversement pour cette période
      </div>
    );
  }

  // One sort and filter state per kind: a new table when the kind changes.
  return <PayoutsGrid key={type} type={type} data={data} currency={currency} paidIds={paidIds} onMarkPaid={handleMarkPaid} />;
}

const feeOf = (row: PayoutRow) => row.commission ?? row.managementFee ?? 0;

function PayoutsGrid({ type, data, currency, paidIds, onMarkPaid }: { type: 'provider' | 'owner'; data: PayoutRow[]; currency: string; paidIds: Set<string>; onMarkPaid: (id: string) => void }) {
  const feeLabel = type === 'provider' ? 'Commission' : 'Frais de gestion';
  // Sort and filter at the top of the columns (as in Excel); the total follows the rows shown.
  const cols = useMemo<ColSpec<PayoutRow>[]>(
    () => [
      { key: 'name', label: type === 'provider' ? 'Prestataire' : 'Propriétaire / Villa', value: (r) => r.name },
      { key: 'gross', label: 'Montant brut', kind: 'number', align: 'right', value: (r) => r.grossAmount },
      { key: 'fee', label: feeLabel, kind: 'number', align: 'right', value: feeOf },
      { key: 'net', label: 'Net à reverser', kind: 'number', align: 'right', value: (r) => r.netAmount },
      { key: 'status', label: 'Statut', align: 'center', value: (r) => (paidIds.has(r.id) || r.status === 'paid' ? 'Versé' : 'À verser') },
    ],
    [type, feeLabel, paidIds],
  );
  const ctl = useTableControls<PayoutRow>(`finance-payouts-${type}`, data, cols);
  const rows = ctl.rows;

  return (
    <>
      <TableFilterSummary ctl={ctl} className="px-4 pt-2 pb-1" />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className="px-4 py-3 text-left text-[12.5px] font-semibold text-muted">
                <ColumnHeader ctl={ctl} col="name" />
              </th>
              <th className="px-4 py-3 text-right text-[12.5px] font-semibold text-muted">
                <ColumnHeader ctl={ctl} col="gross" />
              </th>
              <th className="px-4 py-3 text-right text-[12.5px] font-semibold text-muted">
                <ColumnHeader ctl={ctl} col="fee" />
              </th>
              <th className="px-4 py-3 text-right text-[12.5px] font-semibold text-muted">
                <ColumnHeader ctl={ctl} col="net" />
              </th>
              <th className="px-4 py-3 text-center text-[12.5px] font-semibold text-muted">
                <ColumnHeader ctl={ctl} col="status" />
              </th>
              <th className="px-4 py-3 text-right text-[12.5px] font-semibold text-muted">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const isPaid = paidIds.has(row.id) || row.status === 'paid';
              const fee = feeOf(row);

              return (
                <tr key={row.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-sm text-ink">{row.name}</p>
                    {(row.orderCount != null || row.stayCount != null) && (
                      <p className="text-xs text-muted">
                        {row.orderCount != null
                          ? `${row.orderCount} commande${row.orderCount !== 1 ? 's' : ''}`
                          : `${row.stayCount} séjour${(row.stayCount ?? 0) !== 1 ? 's' : ''}`}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-ink">
                    {formatCurrency(row.grossAmount, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted">
                    - {formatCurrency(fee, currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-accent">
                    {formatCurrency(row.netAmount, currency)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isPaid ? (
                      <Badge variant="active">Versé</Badge>
                    ) : (
                      <Badge variant="pending">À verser</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isPaid ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Check size={12} />}
                        onClick={() => onMarkPaid(row.id)}
                      >
                        Marquer payé
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">Versé</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-line">
            <tr>
              <td className="px-4 py-3 text-sm font-medium text-muted">Total</td>
              <td className="px-4 py-3 text-right text-sm font-medium text-ink">
                {formatCurrency(rows.reduce((s, r) => s + r.grossAmount, 0), currency)}
              </td>
              <td className="px-4 py-3 text-right text-sm text-muted">
                - {formatCurrency(rows.reduce((s, r) => s + feeOf(r), 0), currency)}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium text-accent">
                {formatCurrency(rows.reduce((s, r) => s + r.netAmount, 0), currency)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
