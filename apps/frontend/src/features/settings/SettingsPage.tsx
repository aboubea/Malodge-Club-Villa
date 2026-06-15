import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Globe, Bell, Shield, Puzzle, Save, RefreshCw, Key } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { apiClient } from '../../lib/apiClient';

const TABS = [
  { id: 'general', label: 'Général', icon: Settings },
  { id: 'appearance', label: 'Apparence', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'roles', label: 'Rôles', icon: Shield },
  { id: 'integrations', label: 'Intégrations', icon: Puzzle },
];

const ROLES_CONFIG = [
  { role: 'SUPER_ADMIN', label: 'Super Admin', permissions: ['Accès total', 'Gestion utilisateurs', 'Paramètres système'], variant: 'super_admin' as const },
  { role: 'ADMIN', label: 'Administrateur', permissions: ['Gestion villas', 'Gestion réservations', 'Rapports'], variant: 'admin' as const },
  { role: 'MANAGER', label: 'Manager', permissions: ['Gestion villas assignées', 'Services', 'Prestataires'], variant: 'manager' as const },
  { role: 'PROVIDER', label: 'Prestataire', permissions: ['Voir commandes', 'Mettre à jour statuts'], variant: 'provider' as const },
  { role: 'CLIENT', label: 'Client', permissions: ['Voir réservations', 'Commander services'], variant: 'client' as const },
];

const OTHER_INTEGRATIONS = [
  { name: 'Stripe', description: 'Paiements en ligne sécurisés', icon: '💳' },
  { name: 'Resend', description: "Envoi d'emails transactionnels", icon: '📧' },
  { name: 'Twilio', description: 'SMS et WhatsApp', icon: '💬' },
  { name: 'Cloudflare R2', description: 'Stockage de fichiers', icon: '☁️' },
];

export function SettingsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('general');
  const [companyName, setCompanyName] = useState('Malodge Club Villa');
  const [supportEmail, setSupportEmail] = useState('support@malodge.com');
  const [notifications, setNotifications] = useState({
    newReservation: true,
    reservationStatusChange: true,
    newOrder: true,
    orderStatusChange: false,
    newMessage: true,
    weeklyReport: false,
  });

  // Lodgify integration
  const [lodgifyKey, setLodgifyKey] = useState('');
  const { data: lodgifyStatus, refetch: refetchLodgify } = useQuery({
    queryKey: ['lodgify-status'],
    queryFn: async () => {
      const res = await apiClient.get('/lodgify/status');
      return res.data?.data ?? res.data;
    },
  });
  const saveLodgifyKeyMutation = useMutation({
    mutationFn: (apiKey: string) => apiClient.post('/lodgify/api-key', { apiKey }),
    onSuccess: () => {
      toast.success('Clé API Lodgify sauvegardée');
      setLodgifyKey('');
      refetchLodgify();
      qc.invalidateQueries({ queryKey: ['lodgify-status'] });
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });
  const syncLodgifyMutation = useMutation({
    mutationFn: () => apiClient.post('/lodgify/sync/all'),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      toast.success(`Sync OK : ${d?.properties?.synced ?? 0} propriétés, ${d?.reservations?.synced ?? 0} réservations`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur sync Lodgify'),
  });

  return (
    <div className="space-y-6 max-w-[1000px]">
      <PageHeader title="Paramètres" description="Configurer votre plateforme" />

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <div className="w-48 shrink-0">
          <nav className="space-y-0.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 text-left ${
                  activeTab === tab.id
                    ? 'bg-[#C9A96E]/10 text-[#C9A96E]'
                    : 'text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#111113]'
                }`}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {activeTab === 'general' && (
              <>
                <Card>
                  <CardHeader><CardTitle>Informations de l'entreprise</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <Input label="Nom de l'entreprise" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                    <Input label="Email de support" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
                    <Input label="Téléphone" placeholder="+33 1 00 00 00 00" />
                    <Input label="Site web" placeholder="https://malodge.com" />
                    <Button variant="primary" size="sm" icon={<Save size={13} />}>Sauvegarder</Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Logo</CardTitle></CardHeader>
                  <CardContent>
                    <div className="border-2 border-dashed border-[#242428] rounded-xl p-8 text-center cursor-pointer hover:border-[#C9A96E]/30 transition-colors">
                      <p className="text-sm text-[#6B6B6F]">Glissez votre logo ici ou cliquez pour sélectionner</p>
                      <p className="text-xs text-[#6B6B6F] mt-1">PNG, JPG, SVG — max 2MB</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'appearance' && (
              <Card>
                <CardHeader><CardTitle>Thème</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { name: 'Malodge Dark', colors: ['#0A0A0B', '#111113', '#C9A96E', '#F5F0EB'], active: true },
                      { name: 'Classic Light', colors: ['#FFFFFF', '#F8F9FA', '#1A1A2E', '#1A1A2E'], active: false },
                    ].map((theme) => (
                      <div key={theme.name} className={`p-4 rounded-xl border cursor-pointer transition-all ${theme.active ? 'border-[#C9A96E]/50 bg-[#C9A96E]/5' : 'border-[#242428] hover:border-[#C9A96E]/20'}`}>
                        <div className="flex gap-2 mb-3">
                          {theme.colors.map((c, i) => (
                            <div key={i} className="w-6 h-6 rounded-full border border-white/10" style={{ backgroundColor: c }} />
                          ))}
                        </div>
                        <p className="text-sm text-[#F5F0EB]">{theme.name}</p>
                        {theme.active && <p className="text-xs text-[#C9A96E] mt-0.5">Actif</p>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'notifications' && (
              <Card>
                <CardHeader><CardTitle>Préférences de notifications</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { key: 'newReservation', label: 'Nouvelle réservation', desc: 'Notifié à chaque nouvelle réservation' },
                    { key: 'reservationStatusChange', label: 'Changement de statut de réservation', desc: 'Mises à jour de statut' },
                    { key: 'newOrder', label: 'Nouvelle commande', desc: 'Quand un client commande un service' },
                    { key: 'orderStatusChange', label: 'Changement de statut de commande', desc: 'Mises à jour de commandes' },
                    { key: 'newMessage', label: 'Nouveau message', desc: 'Messages reçus dans les conversations' },
                    { key: 'weeklyReport', label: 'Rapport hebdomadaire', desc: 'Résumé hebdomadaire par email' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-[#242428] last:border-0">
                      <div>
                        <p className="text-sm text-[#F5F0EB]">{label}</p>
                        <p className="text-xs text-[#6B6B6F] mt-0.5">{desc}</p>
                      </div>
                      <button
                        onClick={() => setNotifications((p) => ({ ...p, [key]: !(p as any)[key] }))}
                        className={`w-10 h-5 rounded-full transition-all duration-200 relative ${(notifications as any)[key] ? 'bg-[#C9A96E]' : 'bg-[#242428]'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${(notifications as any)[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {activeTab === 'roles' && (
              <div className="space-y-3">
                {ROLES_CONFIG.map((r) => (
                  <Card key={r.role}>
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Badge variant={r.variant}>{r.label}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {r.permissions.map((p) => (
                          <span key={p} className="px-2 py-1 rounded-md text-xs text-[#6B6B6F] bg-[#1A1A1D] border border-[#242428]">{p}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {activeTab === 'integrations' && (
              <div className="space-y-4">
                {/* Lodgify */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <span>🔗</span> Lodgify PMS
                      <Badge variant={lodgifyStatus?.configured ? 'active' : 'inactive'} className="ml-2">
                        {lodgifyStatus?.configured ? 'Connecté' : 'Non configuré'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-xs text-[#6B6B6F]">Synchronisez vos propriétés et réservations depuis Lodgify PMS automatiquement.</p>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          label="Clé API Lodgify"
                          type="password"
                          placeholder={lodgifyStatus?.configured ? '••••••••••••••••' : 'Entrez votre clé API Lodgify'}
                          value={lodgifyKey}
                          onChange={(e) => setLodgifyKey(e.target.value)}
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Key size={12} />}
                          loading={saveLodgifyKeyMutation.isPending}
                          onClick={() => lodgifyKey && saveLodgifyKeyMutation.mutate(lodgifyKey)}
                          disabled={!lodgifyKey}
                        >
                          Sauvegarder
                        </Button>
                      </div>
                    </div>
                    {lodgifyStatus?.configured && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<RefreshCw size={12} />}
                        loading={syncLodgifyMutation.isPending}
                        onClick={() => syncLodgifyMutation.mutate()}
                      >
                        Synchroniser depuis Lodgify
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Other integrations */}
                {OTHER_INTEGRATIONS.map((integ) => (
                  <Card key={integ.name}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{integ.icon}</span>
                          <div>
                            <p className="text-sm font-medium text-[#F5F0EB]">{integ.name}</p>
                            <p className="text-xs text-[#6B6B6F]">{integ.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="inactive">Non configuré</Badge>
                          <Button variant="secondary" size="sm">Configurer</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
