import { useState } from 'react';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { Plus, Wallet } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { useExtrasOptions, useExtrasSummary } from './api';
import { ExtraFormModal, SettlementFormModal } from './forms';
import { OverviewTab } from './OverviewTab';
import { LinesTab } from './LinesTab';
import { SettlementsTab } from './SettlementsTab';
import { AccountsTab } from './AccountsTab';
import { CatalogueTab } from './CatalogueTab';
import { SettingsTab } from './SettingsTab';

const TABS = [
  { to: '/extras', label: "Vue d'ensemble", end: true },
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

  return (
    <div className="space-y-6">
      <PageHeader title="Suivi des extras" description="Prestations, règlements, cagnottes et commissions — par séjour, propriétaire, prestataire et salarié.">
        <Button variant="secondary" icon={<Wallet size={15} />} onClick={() => setSettlementOpen(true)}>
          Règlement
        </Button>
        <Button icon={<Plus size={15} />} onClick={() => setExtraOpen(true)}>
          Nouvel extra
        </Button>
      </PageHeader>

      <nav className="flex gap-1 border-b border-line overflow-x-auto scrollbar-none -mt-2" aria-label="Sections du suivi des extras">
        {TABS.map((t) => {
          const count = t.badge ? summary?.alerts[t.badge] ?? 0 : 0;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'px-4 py-3 text-[13.5px] whitespace-nowrap border-b-2 -mb-px inline-flex items-center gap-2 transition-colors',
                  isActive ? 'text-ink border-primary font-semibold' : 'text-muted border-transparent hover:text-ink',
                )
              }
            >
              {t.label}
              {count > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-[#2A1A12] text-[10.5px] font-bold flex items-center justify-center">
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
