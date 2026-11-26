import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, Navigate, useSearchParams } from 'react-router-dom';
import { Plus, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { segItem, segOff, segOn, segTrack } from '../../components/ui/segmented';
import { useExtrasOptions, useExtrasSummary } from './api';
import { ExtraFormModal, SettlementFormModal } from './forms';
import { OverviewTab } from './OverviewTab';
import { LinesTab } from './LinesTab';
import { SettlementsTab } from './SettlementsTab';
import { AccountsTab } from './AccountsTab';
import { CatalogueTab } from './CatalogueTab';
import { SettingsTab } from './SettingsTab';

const TABS = [
  { to: '/extras', label: 'Résumé', end: true },
  { to: '/extras/saisie', label: 'Extras' },
  { to: '/extras/reglements', label: 'Règlements', badge: 'pendingSettlements' as const },
  { to: '/extras/comptes', label: 'Comptes' },
  { to: '/extras/catalogue', label: 'Catalogue' },
  { to: '/extras/reglages', label: 'Réglages', badge: 'settingsToCheck' as const },
];

export function ExtrasPage() {
  const { data: options } = useExtrasOptions();
  const { data: summary } = useExtrasSummary();
  const [extraOpen, setExtraOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  // ?new=extra | settlement (the "+ Nouveau" button, from anywhere): open the form at once.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const what = params.get('new');
    if (what !== 'extra' && what !== 'settlement') return;
    if (what === 'extra') setExtraOpen(true);
    else setSettlementOpen(true);
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <div className="space-y-6">
      <PageHeader title="Suivi des extras" description="Ce qui a été vendu, et qui doit quoi à qui.">
        <Button variant="secondary" icon={<Wallet size={15} />} onClick={() => setSettlementOpen(true)}>
          Règlement
        </Button>
        <Button icon={<Plus size={15} />} onClick={() => setExtraOpen(true)}>
          Nouvel extra
        </Button>
      </PageHeader>

      <nav className={cn(segTrack, '-mt-2')} aria-label="Sections du suivi des extras">
        {TABS.map((t) => {
          const count = t.badge ? summary?.alerts[t.badge] ?? 0 : 0;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(segItem, 'inline-flex items-center gap-1.5', isActive ? segOn : segOff)
              }
            >
              {t.label}
              {count > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-on-primary text-[10.5px] font-bold flex items-center justify-center">
                  {count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <Routes>
        <Route index element={<OverviewTab options={options} />} />
        <Route path="saisie" element={<LinesTab options={options} />} />
        <Route path="reglements" element={<SettlementsTab options={options} />} />
        <Route path="comptes" element={<AccountsTab options={options} />} />
        <Route path="catalogue" element={<CatalogueTab options={options} />} />
        <Route path="reglages" element={<SettingsTab />} />
        <Route path="*" element={<Navigate to="/extras" replace />} />
      </Routes>

      <ExtraFormModal open={extraOpen} onClose={() => setExtraOpen(false)} options={options} />
      <SettlementFormModal open={settlementOpen} onClose={() => setSettlementOpen(false)} options={options} />
    </div>
  );
}
