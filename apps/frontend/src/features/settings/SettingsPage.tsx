import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Globe, Bell, Shield, Puzzle, Save, MapPin, Trash2, Plus, RefreshCw, Key } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import type { Country } from '../../hooks/useCountries';
import { useUIStore, type ThemePreference } from '../../store/uiStore';

const LIGHT = { bg: '#F7F7F9', card: '#FFFFFF', ink: '#1C1D29' };
const DARK = { bg: '#111218', card: '#22232D', ink: '#F0F0F5' };

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string; swatches: typeof LIGHT[] }[] = [
  { value: 'light', label: 'Clair', hint: 'Blanc, gris doux et pêche', swatches: [LIGHT] },
  { value: 'dark', label: 'Sombre', hint: 'Bleu nuit et pêche', swatches: [DARK] },
  { value: 'system', label: 'Automatique', hint: 'Suit votre appareil', swatches: [LIGHT, DARK] },
];

const TABS = [
  { id: 'general', label: 'Général', icon: Settings },
  { id: 'appearance', label: 'Apparence', icon: Globe },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'pays', label: 'Pays', icon: MapPin },
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
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { theme, setTheme } = useUIStore();


  const [activeTab, setActiveTab] = useState('general');
  const [companyName, setCompanyName] = useState('Malodge Club Villa');
  const [supportEmail, setSupportEmail] = useState('support@malodge.com');

  // Countries management
  const { data: countriesData } = useQuery<Country[]>({
    queryKey: ['settings-countries'],
    queryFn: async () => { const res = await apiClient.get('/settings/countries'); return res.data.data ?? res.data; },
  });
  const [newCountry, setNewCountry] = useState<Country>({ code: '', name: '', flag: '' });

  const saveCountriesMutation = useMutation({
    mutationFn: (countries: Country[]) => apiClient.put('/settings/countries', { countries }),
    onSuccess: () => { toast.success('Pays mis à jour'); qc.invalidateQueries({ queryKey: ['settings-countries'] }); },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  const countries: Country[] = countriesData ?? [];

  function addCountry() {
    if (!newCountry.name.trim() || !newCountry.code.trim()) return;
    if (countries.some((c) => c.code === newCountry.code.toUpperCase())) {
      toast.error('Code pays déjà utilisé'); return;
    }
    const updated = [...countries, { ...newCountry, code: newCountry.code.toUpperCase() }];
    saveCountriesMutation.mutate(updated);
    setNewCountry({ code: '', name: '', flag: '' });
  }

  function removeCountry(code: string) {
    saveCountriesMutation.mutate(countries.filter((c) => c.code !== code));
  }

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
    // Two requests (listings, then bookings): each stays within the server's time limit.
    mutationFn: async () => {
      const unwrap = (r: any) => r.data?.data ?? r.data;
      const properties = unwrap(await apiClient.post('/lodgify/sync/properties', {}, { timeout: 60_000 }));
      const reservations = unwrap(await apiClient.post('/lodgify/sync/reservations', {}, { timeout: 60_000 }));
      return { data: { properties, reservations } };
    },
    onSuccess: (res) => {
      const d = res.data as any;
      if (d?.reservations?.unknownProperties?.length) {
        toast(`Réservations ignorées : logement(s) Lodgify pas encore dans l’appli (${d.reservations.unknownProperties.join(', ')}).`, { duration: 9000 });
      }
      toast.success(`Sync OK : ${d?.properties?.synced ?? 0} propriétés, ${d?.reservations?.synced ?? 0} réservations`);
      if (d?.properties?.incomplete) {
        toast(`${d.properties.incomplete} logement(s) sans chambres ou voyageurs renseignés dans Lodgify : à compléter sur la fiche villa.`, { duration: 7000 });
      }
      qc.invalidateQueries({ queryKey: ['villas'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
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
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:text-ink hover:bg-surface'
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
                    <div className="border-2 border-dashed border-line rounded-xl p-8 text-center cursor-pointer hover:border-accent/30 transition-colors">
                      <p className="text-sm text-muted">Glissez votre logo ici ou cliquez pour sélectionner</p>
                      <p className="text-xs text-muted mt-1">PNG, JPG, SVG — max 2MB</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'appearance' && (
              <Card>
                <CardHeader>
                  <CardTitle>Thème</CardTitle>
                  <p className="text-[12.5px] text-muted mt-0.5">Préférence enregistrée sur cet appareil.</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Thème">
                    {THEME_OPTIONS.map((opt) => {
                      const active = theme === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setTheme(opt.value)}
                          className={`group text-left p-3 rounded-2xl border transition-all ${active ? 'border-accent ring-4 ring-accent/10' : 'border-line hover:border-line-strong'}`}
                        >
                          <div className="relative h-24 rounded-xl overflow-hidden border border-black/5 flex">
                            {opt.swatches.map((half, i) => (
                              <div key={i} className="flex-1 p-2.5 flex flex-col gap-1.5" style={{ backgroundColor: half.bg }}>
                                <div className="h-2 w-10 rounded-full" style={{ backgroundColor: half.ink, opacity: 0.85 }} />
                                <div className="h-2 w-14 rounded-full" style={{ backgroundColor: half.ink, opacity: 0.3 }} />
                                <div className="mt-auto h-5 w-12 rounded-md" style={{ backgroundColor: half.card, boxShadow: '0 1px 2px rgb(0 0 0 / 0.08)' }} />
                                <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: '#E9A686' }} />
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-3 px-1">
                            <div>
                              <p className="text-[13.5px] font-medium text-ink">{opt.label}</p>
                              <p className="text-[12px] text-muted">{opt.hint}</p>
                            </div>
                            <span className={`w-4 h-4 rounded-full border-2 transition-colors ${active ? 'border-accent bg-accent shadow-[inset_0_0_0_2px_rgb(var(--c-surface))]' : 'border-line-strong'}`} />
                          </div>
                        </button>
                      );
                    })}
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
                    <div key={key} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                      <div>
                        <p className="text-sm text-ink">{label}</p>
                        <p className="text-xs text-muted mt-0.5">{desc}</p>
                      </div>
                      <button
                        onClick={() => setNotifications((p) => ({ ...p, [key]: !(p as any)[key] }))}
                        className={`w-10 h-5 rounded-full transition-all duration-200 relative ${(notifications as any)[key] ? 'bg-accent' : 'bg-line'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${(notifications as any)[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {activeTab === 'pays' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Pays disponibles</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {countries.length === 0 && (
                      <p className="text-sm text-muted py-4 text-center">Aucun pays configuré</p>
                    )}
                    {countries.map((c) => (
                      <div key={c.code} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface border border-line">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{c.flag}</span>
                          <div>
                            <p className="text-sm text-ink">{c.name}</p>
                            <p className="text-[11px] text-muted font-mono">{c.code}</p>
                          </div>
                        </div>
                        {isSuperAdmin && (
                          <button
                            onClick={() => removeCountry(c.code)}
                            className="p-1.5 text-muted hover:text-danger transition-colors rounded hover:bg-danger/10"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {isSuperAdmin && (
                  <Card>
                    <CardHeader><CardTitle>Ajouter un pays</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <Input
                          label="Drapeau (emoji)"
                          placeholder="🇫🇷"
                          value={newCountry.flag}
                          onChange={(e) => setNewCountry((p) => ({ ...p, flag: e.target.value }))}
                        />
                        <Input
                          label="Nom"
                          placeholder="France"
                          value={newCountry.name}
                          onChange={(e) => setNewCountry((p) => ({ ...p, name: e.target.value }))}
                        />
                        <Input
                          label="Code ISO"
                          placeholder="FR"
                          value={newCountry.code}
                          onChange={(e) => setNewCountry((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                          maxLength={3}
                        />
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Plus size={13} />}
                        onClick={addCountry}
                        disabled={saveCountriesMutation.isPending}
                      >
                        Ajouter
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
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
                          <span key={p} className="px-2 py-1 rounded-md text-xs text-muted bg-surface-2 border border-line">{p}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {activeTab === 'integrations' && (
              <div className="space-y-4">
                <MailCard />
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
                    <p className="text-xs text-muted">Synchronisez vos propriétés et réservations depuis Lodgify PMS automatiquement.</p>
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
                            <p className="text-sm font-medium text-ink">{integ.name}</p>
                            <p className="text-xs text-muted">{integ.description}</p>
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

/** E-mail sending (Resend): configuration seen by the server and a test that shows the exact refusal, if any. */
function MailCard() {
  const { data: status } = useQuery({
    queryKey: ['settings-mail'],
    queryFn: async () => {
      const r = await apiClient.get('/settings/mail');
      return (r.data?.data ?? r.data) as { configured: boolean; keyLooksValid: boolean; from: string; fromDomain: string | null; fromIsDefault: boolean; fromVariable?: string | null; appUrl: string; appUrlIsDefault: boolean };
    },
  });
  const [to, setTo] = useState('');
  const [result, setResult] = useState<{ sent: boolean; error?: string; to: string } | null>(null);
  const test = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post('/settings/mail/test', to ? { to } : {});
      return (r.data?.data ?? r.data) as { sent: boolean; error?: string; to: string };
    },
    onSuccess: (r) => setResult(r),
  });
  const advice = (err?: string) => {
    const e = (err ?? '').toLowerCase();
    if (e.includes('resend_api_key')) return 'Ajoutez RESEND_API_KEY dans Vercel (Settings › Environment Variables), puis redéployez : Vercel ne prend une variable en compte qu’au déploiement suivant.';
    if (e.includes('domain') || e.includes('verify') || e.includes('not verified')) return `Le domaine de l’expéditeur (${status?.fromDomain ?? '—'}) doit être vérifié dans Resend (Domains), ou MAIL_FROM doit utiliser un domaine déjà vérifié.`;
    if (e.includes('testing emails') || e.includes('own email')) return 'Avec l’expéditeur de test de Resend, seuls des envois vers l’adresse du compte Resend sont possibles : vérifiez votre domaine et renseignez MAIL_FROM.';
    if (e.includes('api key') || e.includes('unauthorized') || e.includes('restricted')) return 'La clé RESEND_API_KEY est refusée : recopiez une clé valide (avec le droit « Sending access ») puis redéployez.';
    return null;
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>✉️</span> E-mails (Resend)
          <Badge variant={status?.configured ? 'active' : 'inactive'} className="ml-2">
            {status?.configured ? 'Clé présente' : 'Clé absente'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <div className="px-6 pb-6 space-y-3 text-[13px]">
        <ul className="space-y-1 text-ink-soft">
          <li>
            Expéditeur : <b className="text-ink">{status?.from ?? '…'}</b>
            {status?.fromVariable && <span className="text-muted"> (lu dans {status.fromVariable})</span>}
            {status?.fromIsDefault && (
              <span className="text-warning">
                {' '}
                — aucune variable MAIL_FROM lue par ce déploiement : vérifiez son nom, qu’elle est cochée pour « Production », puis redéployez
              </span>
            )}
          </li>
          <li>
            Liens des e-mails vers (APP_URL) : <b className="text-ink">{status?.appUrl ?? '…'}</b>
            {status?.appUrlIsDefault && <span className="text-muted"> (déduit de Vercel)</span>}
          </li>
          {status?.configured && !status.keyLooksValid && <li className="text-warning">La clé ne ressemble pas à une clé Resend (re_…).</li>}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Votre adresse (par défaut celle de votre compte)"
            className="h-9 min-w-[260px] flex-1 rounded-full border border-line bg-surface px-3 text-[13px] text-ink"
          />
          <Button size="sm" loading={test.isPending} onClick={() => test.mutate()}>
            Envoyer un e-mail de test
          </Button>
        </div>
        {result &&
          (result.sent ? (
            <p className="rounded-xl bg-success/10 text-success px-3 py-2 font-semibold">E-mail de test envoyé à {result.to}. Vérifiez la boîte de réception (et les indésirables).</p>
          ) : (
            <div className="rounded-xl bg-danger/10 text-danger px-3 py-2">
              <p className="font-semibold">Refusé : {result.error}</p>
              {advice(result.error) && <p className="mt-1 text-ink-soft">{advice(result.error)}</p>}
            </div>
          ))}
      </div>
    </Card>
  );
}
