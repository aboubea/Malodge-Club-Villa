import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Mail, Merge } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { apiClient } from '../../lib/apiClient';
import { formatDate } from '../../lib/utils';
import { UserDto, Role } from '@malodge/shared';
import { ROLES_LABELS } from '../../lib/constants';
import { UserForm } from './UserForm';
import { MergePeopleModal, PeopleDuplicatesBanner, PickPersonModal, type PeoplePair, type PersonRef } from './PeopleMerge';
import { DeleteUserModal, EmptyClientsBanner } from './DeleteUser';

const ROLE_FILTER_OPTIONS = [
  { label: 'Tous', value: '' },
  { label: 'Super Admin', value: Role.SUPER_ADMIN },
  { label: 'Admin', value: Role.ADMIN },
  { label: 'Manager', value: Role.MANAGER },
  { label: 'Prestataire', value: Role.PROVIDER },
  { label: 'Client', value: Role.CLIENT },
  { label: 'Propriétaire', value: Role.OWNER },
  { label: 'Salarié', value: Role.EMPLOYEE },
];

const ROLE_BADGE_MAP: Record<string, any> = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  PROVIDER: 'provider',
  CLIENT: 'client',
  OWNER: 'gold',
  EMPLOYEE: 'admin',
};

export function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  // Duplicate records of the same person (typos): merged into one.
  const [mergePair, setMergePair] = useState<PeoplePair | null>(null);
  const [mergeFrom, setMergeFrom] = useState<(PersonRef & { role: string }) | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search, role }],
    queryFn: async () => {
      // The whole list: sorting and filtering by column cover everyone, not one page.
      const params = new URLSearchParams({ page: '1', limit: '1000' });
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      const res = await apiClient.get(`/users?${params}`);
      return res.data.data || res.data;
    },
  });

  // Deleting: the server says first whether the person can go (no history) or must be merged / switched off.
  const [deleting, setDeleting] = useState<UserDto | null>(null);
  const deactivate = useMutation({
    mutationFn: (id: string) => apiClient.patch(`/users/${id}`, { isActive: false }),
    onSuccess: () => {
      toast.success('Fiche désactivée');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Désactivation impossible'),
  });

  // (Re)send the e-mail that lets the user choose their password; says why if it did not leave.
  const inviteMutation = useMutation({
    mutationFn: async (row: UserDto) => {
      const r = await apiClient.post(`/users/${row.id}/invite`);
      return { row, result: (r.data?.data ?? r.data) as { sent: boolean; error?: string } };
    },
    onSuccess: ({ row, result }) => {
      if (result.sent) toast.success(`Invitation envoyée à ${row.email}`);
      else toast.error(`Invitation non envoyée : ${result.error ?? 'raison inconnue'}`, { duration: 10000 });
    },
  });

  const columns: Column<UserDto>[] = [
    {
      key: 'user',
      header: 'Utilisateur',
      value: (row) => `${row.firstName} ${row.lastName}`.trim(),
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar firstName={row.firstName} lastName={row.lastName} src={row.avatar} size="sm" />
          <div>
            <p className="text-sm text-ink">{row.firstName} {row.lastName}</p>
            <p className="text-xs text-muted">{row.email.endsWith('@fiche.malodge.invalid') ? 'Fiche sans accès à l’application' : row.email}</p>
          </div>
          {['CLIENT', 'PROVIDER', 'OWNER', 'EMPLOYEE'].includes(row.role) && (
            <button
              type="button"
              onClick={() => setMergeFrom({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim(), role: row.role })}
              className="ml-auto h-7 px-2.5 inline-flex items-center gap-1 rounded-full border border-line text-[11.5px] text-ink-soft hover:text-ink hover:border-line-strong"
              title="Fusionner avec une autre fiche de la même personne (doublon)"
            >
              <Merge size={12} /> Fusionner
            </button>
          )}
          {!/\.(invalid|local)$/i.test(row.email) && (
            <button
              type="button"
              onClick={() => inviteMutation.mutate(row)}
              disabled={inviteMutation.isPending}
              className="h-7 px-2.5 inline-flex items-center gap-1 rounded-full border border-line text-[11.5px] text-ink-soft hover:text-ink hover:border-line-strong disabled:opacity-50"
              title="Envoyer un e-mail pour choisir son mot de passe"
            >
              <Mail size={12} /> Inviter
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rôle',
      value: (row) => ROLES_LABELS[row.role] || row.role,
      render: (row) => (
        <Badge variant={ROLE_BADGE_MAP[row.role] || 'default'}>
          {ROLES_LABELS[row.role] || row.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      value: (row) => (row.isActive ? 'Actif' : 'Inactif'),
      render: (row) => (
        <Badge variant={row.isActive ? 'active' : 'inactive'}>
          {row.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'countries',
      header: 'Pays',
      value: (row) => ((row as any).countries?.length ? (row as any).countries.join(', ') : 'Global'),
      render: (row) => {
        const countries: string[] = (row as any).countries || [];
        if (countries.length === 0) return <span className="text-[11px] text-muted italic">Global</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {countries.map((c) => (
              <span key={c} className="px-1.5 py-0.5 rounded text-[10px] bg-surface-2 border border-line text-muted">{c}</span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'lastLoginAt',
      header: 'Dernière connexion',
      kind: 'date',
      value: (row) => row.lastLoginAt ?? null,
      render: (row) => (
        <span className="text-xs text-muted">
          {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Jamais'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Créé le',
      kind: 'date',
      value: (row) => row.createdAt,
      render: (row) => <span className="text-xs text-muted">{formatDate(row.createdAt)}</span>,
    },
  ];

  const users: UserDto[] = data?.data || data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <PageHeader title="Utilisateurs" description={`${meta?.total ?? users.length} utilisateurs`}>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => { setEditingUser(null); setSlideOpen(true); }}>
          Inviter un utilisateur
        </Button>
      </PageHeader>

      <PeopleDuplicatesBanner onPick={setMergePair} />
      <EmptyClientsBanner />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="max-w-xs w-full">
          <Input
            placeholder="Rechercher..."
            leftIcon={<Search size={13} />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {ROLE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setRole(opt.value); setPage(1); }}
              className={`inline-flex items-center h-9 px-4 rounded-full text-[13.5px] font-semibold border transition-colors ${role === opt.value ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink hover:border-ink/50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={users}
        loading={isLoading}
        onEdit={(row) => { setEditingUser(row); setSlideOpen(true); }}
        onDelete={(row) => setDeleting(row)}
        emptyMessage="Aucun utilisateur trouvé"
        tableId="users"
      />

      <Modal
        open={slideOpen}
        onClose={() => { setSlideOpen(false); setEditingUser(null); }}
        title={editingUser ? "Modifier l'utilisateur" : 'Inviter un utilisateur'}
        size="lg"
      >
        <UserForm user={editingUser} onSuccess={() => { setSlideOpen(false); setEditingUser(null); }} />
      </Modal>

      <PickPersonModal
        person={mergeFrom}
        onClose={() => setMergeFrom(null)}
        onPick={(pair) => {
          setMergeFrom(null);
          setMergePair(pair);
        }}
      />
      <MergePeopleModal pair={mergePair} onClose={() => setMergePair(null)} />
      <DeleteUserModal
        user={deleting}
        onClose={() => setDeleting(null)}
        onMerge={(u) => setMergeFrom(u)}
        onDeactivate={(id) => deactivate.mutate(id)}
      />
    </div>
  );
}
