import { useState } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
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

  const feeLabel = type === 'provider' ? 'Commission' : 'Frais de gestion';

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line">
            <th className="px-4 py-3 text-left text-[12.5px] font-semibold text-muted">
              {type === 'provider' ? 'Prestataire' : 'Propriétaire / Villa'}
            </th>
            <th className="px-4 py-3 text-right text-[12.5px] font-semibold text-muted">
              Montant brut
            </th>
            <th className="px-4 py-3 text-right text-[12.5px] font-semibold text-muted">
              {feeLabel}
            </th>
            <th className="px-4 py-3 text-right text-[12.5px] font-semibold text-muted">
              Net à reverser
            </th>
            <th className="px-4 py-3 text-center text-[12.5px] font-semibold text-muted">
              Statut
            </th>
            <th className="px-4 py-3 text-right text-[12.5px] font-semibold text-muted">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.map((row) => {
            const isPaid = paidIds.has(row.id) || row.status === 'paid';
            const fee = row.commission ?? row.managementFee ?? 0;

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
                      onClick={() => handleMarkPaid(row.id)}
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
              {formatCurrency(data.reduce((s, r) => s + r.grossAmount, 0), currency)}
            </td>
            <td className="px-4 py-3 text-right text-sm text-muted">
              - {formatCurrency(data.reduce((s, r) => s + (r.commission ?? r.managementFee ?? 0), 0), currency)}
            </td>
            <td className="px-4 py-3 text-right text-sm font-medium text-accent">
              {formatCurrency(data.reduce((s, r) => s + r.netAmount, 0), currency)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
