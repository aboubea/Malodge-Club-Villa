import { Link } from 'react-router-dom';
import { Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { pct } from '../extras/api';
import { useCommissionRules } from '../extras/CommissionsPanel';

/** The commissions that apply to this villa: management fee, owner's usual rate, its rules. */
export function VillaCommissions({ villaId }: { villaId: string }) {
  const { data } = useCommissionRules();
  if (!data) return null;
  const house = data.options.houses.find((h) => h.id === villaId);
  const owner = house?.owner ? data.options.owners.find((o) => o.id === house.owner!.id) : null;
  const rules = data.rules.filter((r) => r.villa?.id === villaId);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Percent size={14} className="text-accent" /> Commissions
          </CardTitle>
          <Link to={`/extras/reglages?section=commissions&villa=${villaId}`} className="text-[12.5px] font-semibold text-accent hover:underline">
            Gérer les règles →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-[13px]">
        {house && (
          <p className="flex justify-between gap-3">
            <span className="text-muted">Gestion de l’hébergement</span>
            <b className="text-ink">{pct(house.managementFeeRate)}</b>
          </p>
        )}
        <p className="flex justify-between gap-3">
          <span className="text-muted">Part du propriétaire sur les extras</span>
          <b className={owner?.rate == null ? 'text-warning' : 'text-ink'}>{!house?.owner ? 'pas de propriétaire' : owner?.rate == null ? 'taux à renseigner' : `${pct(owner.rate)} de la marge`}</b>
        </p>
        {rules.length > 0 && (
          <ul className="pt-2 border-t border-line space-y-1.5">
            {rules.map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span className="text-ink-soft truncate">
                  {r.beneficiary === 'OWNER' ? 'Propriétaire' : r.person?.name ?? 'Salariés'} · {r.service?.name ?? r.category?.name ?? 'tous les extras'}
                  {r.validFrom || r.validTo ? ' (période)' : ''}
                </span>
                <b className="text-ink shrink-0">{r.description}</b>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
