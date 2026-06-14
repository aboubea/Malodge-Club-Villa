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
}

export function PayoutsTable({ type, data, onMarkPaid }: PayoutsTableProps) {
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());

  function handleMarkPaid(id: string) {
    setPaidIds((prev) => new Set([...prev, id]));
    onMarkPaid?.(id);
  }

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[#6B6B6F]">
        Aucun reversement pour cette période
      </div>
    );
  }

  const feeLabel = type === 'provider' ? 'Commission' : 'Frais de gestion';

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#242428]">
            <th className="px-4 py-3 text-left text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">
              {type === 'provider' ? 'Prestataire' : 'Propriétaire / Villa'}
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">
              Montant brut
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">
              {feeLabel}
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">
              Net à reverser
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">
              Statut
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#242428]">
          {data.map((row) => {
            const isPaid = paidIds.has(row.id) || row.status === 'paid';
            const fee = row.commission ?? row.managementFee ?? 0;

            return (
              <tr key={row.id} className="hover:bg-[#1A1A1D] transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm text-[#F5F0EB]">{row.name}</p>
                  {(row.orderCount != null || row.stayCount != null) && (
                    <p className="text-xs text-[#6B6B6F]">
                      {row.orderCount != null
                        ? `${row.orderCount} commande${row.orderCount !== 1 ? 's' : ''}`
                        : `${row.stayCount} séjour${(row.stayCount ?? 0) !== 1 ? 's' : ''}`}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-sm text-[#F5F0EB]">
                  {formatCurrency(row.grossAmount)}
                </td>
                <td className="px-4 py-3 text-right text-sm text-[#6B6B6F]">
                  - {formatCurrency(fee)}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium text-[#C9A96E]">
                  {formatCurrency(row.netAmount)}
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
                    <span className="text-xs text-[#6B6B6F]">Versé</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-[#242428]">
          <tr>
            <td className="px-4 py-3 text-sm font-medium text-[#6B6B6F]">Total</td>
            <td className="px-4 py-3 text-right text-sm font-medium text-[#F5F0EB]">
              {formatCurrency(data.reduce((s, r) => s + r.grossAmount, 0))}
            </td>
            <td className="px-4 py-3 text-right text-sm text-[#6B6B6F]">
              - {formatCurrency(data.reduce((s, r) => s + (r.commission ?? r.managementFee ?? 0), 0))}
            </td>
            <td className="px-4 py-3 text-right text-sm font-medium text-[#C9A96E]">
              {formatCurrency(data.reduce((s, r) => s + r.netAmount, 0))}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
