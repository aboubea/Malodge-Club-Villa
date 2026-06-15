import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
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

const ROLE_FILTER_OPTIONS = [
  { label: 'Tous', value: '' },
  { label: 'Super Admin', value: Role.SUPER_ADMIN },
  { label: 'Admin', value: Role.ADMIN },
  { label: 'Manager', value: Role.MANAGER },
  { label: 'Prestataire', value: Role.PROVIDER },
  { label: 'Client', value: Role.CLIENT },
];

const ROLE_BADGE_MAP: Record<string, any> = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  PROVIDER: 'provider',
  CLIENT: 'client',
};

export function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search, role }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      const res = await apiClient.get(`/users?${params}`);
      return res.data.data || res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success('Utilisateur supprimé');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const columns: Column<UserDto>[] = [
    {
      key: 'user',
      header: 'Utilisateur',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar firstName={row.firstName} lastName={row.lastName} src={row.avatar} size="sm" />
          <div>
            <p className="text-sm text-[#F5F0EB]">{row.firstName} {row.lastName}</p>
            <p className="text-xs text-[#6B6B6F]">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rôle',
      render: (row) => (
        <Badge variant={ROLE_BADGE_MAP[row.role] || 'default'}>
          {ROLES_LABELS[row.role] || row.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <Badge variant={row.isActive ? 'active' : 'inactive'}>
          {row.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'countries',
      header: 'Pays',
      render: (row) => {
        const countries: string[] = (row as any).countries || [];
        if (countries.length === 0) return <span className="text-[11px] text-[#3A3A3E] italic">Global</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {countries.map((c) => (
              <span key={c} className="px-1.5 py-0.5 rounded text-[10px] bg-[#1A1A1D] border border-[#242428] text-[#6B6B6F]">{c}</span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'lastLoginAt',
      header: 'Dernière connexion',
      render: (row) => (
        <span className="text-xs text-[#6B6B6F]">
          {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Jamais'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Créé le',
      sortable: true,
      render: (row) => <span className="text-xs text-[#6B6B6F]">{formatDate(row.createdAt)}</span>,
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
              className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${role === opt.value ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
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
        onDelete={(row) => { if (confirm(`Supprimer ${row.firstName} ${row.lastName} ?`)) deleteMutation.mutate(row.id); }}
        emptyMessage="Aucun utilisateur trouvé"
        pagination={meta ? { page, totalPages: meta.totalPages, onPageChange: setPage } : undefined}
      />

      <Modal
        open={slideOpen}
        onClose={() => { setSlideOpen(false); setEditingUser(null); }}
        title={editingUser ? "Modifier l'utilisateur" : 'Inviter un utilisateur'}
        size="lg"
      >
        <UserForm user={editingUser} onSuccess={() => { setSlideOpen(false); setEditingUser(null); }} />
      </Modal>
    </div>
  );
}
