import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, FileSpreadsheet, File, Download, BrainCircuit,
  Trash2, Plus, MoreHorizontal, FolderOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { SlideOver } from '../../components/ui/SlideOver';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import apiClient from '../../lib/apiClient';
import { formatDate } from '../../lib/utils';

const CATEGORIES = [
  { value: '', label: 'Tous' },
  { value: 'villas', label: 'Villas' },
  { value: 'prestataires', label: 'Prestataires' },
  { value: 'contrats', label: 'Contrats' },
  { value: 'guides', label: 'Guides' },
  { value: 'factures', label: 'Factures' },
  { value: 'faq', label: 'FAQ' },
  { value: 'general', label: 'Général' },
];

interface Document {
  id: string;
  name: string;
  type: string;
  fileUrl: string;
  fileSize?: number;
  version: number;
  category: string;
  villaId?: string;
  createdAt: string;
  villa?: { name: string };
}

function fileIcon(type: string) {
  if (type === 'pdf') return <FileText size={20} className="text-red-400" />;
  if (type === 'xlsx' || type === 'csv') return <FileSpreadsheet size={20} className="text-green-400" />;
  return <File size={20} className="text-blue-400" />;
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const qc = useQueryClient();
  const [category, setCategory] = useState('');
  const [slideOpen, setSlideOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'pdf', fileUrl: '', category: 'general' });
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['documents', category],
    queryFn: () =>
      apiClient
        .get('/documents', { params: { category: category || undefined, limit: 50 } })
        .then((r) => (r.data?.data ?? r.data) as Document[]),
  });

  const createMutation = useMutation({
    mutationFn: (dto: typeof form) => apiClient.post('/documents', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      setSlideOpen(false);
      setForm({ name: '', type: 'pdf', fileUrl: '', category: 'general' });
      toast.success('Document ajouté');
    },
    onError: () => toast.error('Erreur lors de l\'ajout'),
  });

  const ingestMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/documents/${id}/ingest`),
    onSuccess: () => toast.success('Document indexé pour le concierge IA'),
    onError: () => toast.error('Erreur lors de l\'indexation'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents'] }); toast.success('Supprimé'); },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const docs = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader title="Documents" description="Base documentaire et indexation IA">
        <Button variant="primary" size="sm" onClick={() => setSlideOpen(true)}>
          <Plus size={14} />
          Ajouter un document
        </Button>
      </PageHeader>

      {/* Category filters */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              category === c.value
                ? 'bg-[#C9A96E] text-[#0A0A0B]'
                : 'bg-[#111113] border border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Document grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen size={32} className="text-[#6B6B6F] mb-3" />
          <p className="text-sm text-[#6B6B6F]">Aucun document trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {docs.map((doc, i) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="p-4 hover:border-[#C9A96E]/20 transition-all duration-200 group relative">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-[#1A1A1D] flex items-center justify-center">
                    {fileIcon(doc.type)}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === doc.id ? null : doc.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {openMenu === doc.id && (
                      <div className="absolute right-0 top-8 w-44 bg-[#111113] border border-[#242428] rounded-xl shadow-xl z-10 py-1">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors"
                          onClick={() => setOpenMenu(null)}
                        >
                          <Download size={13} /> Télécharger
                        </a>
                        <button
                          onClick={() => { ingestMutation.mutate(doc.id); setOpenMenu(null); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors"
                        >
                          <BrainCircuit size={13} /> Indexer pour l'IA
                        </button>
                        <div className="my-1 border-t border-[#242428]" />
                        <button
                          onClick={() => { if (confirm('Supprimer ce document ?')) { deleteMutation.mutate(doc.id); setOpenMenu(null); } }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={13} /> Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <p className="text-sm text-[#F5F0EB] font-light leading-snug line-clamp-2 mb-2">
                  {doc.name}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="active" className="text-[10px]">{doc.category}</Badge>
                  <span className="text-[10px] text-[#6B6B6F] border border-[#242428] px-1.5 py-0.5 rounded">
                    v{doc.version}
                  </span>
                  {doc.fileSize && (
                    <span className="text-[10px] text-[#6B6B6F]">{formatSize(doc.fileSize)}</span>
                  )}
                </div>
                {doc.villa && (
                  <p className="text-[10px] text-[#6B6B6F] mt-1.5 truncate">{doc.villa.name}</p>
                )}
                <p className="text-[10px] text-[#6B6B6F] mt-1">{formatDate(doc.createdAt)}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add document SlideOver */}
      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Ajouter un document"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }}
          className="space-y-4"
        >
          <Input
            label="Nom du document"
            placeholder="Guide d'accueil Villa Émeraude"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <div>
            <label className="block text-xs text-[#6B6B6F] mb-1.5">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-sm text-[#F5F0EB] focus:outline-none focus:border-[#C9A96E]/40"
            >
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6F] mb-1.5">Catégorie</label>
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-sm text-[#F5F0EB] focus:outline-none focus:border-[#C9A96E]/40"
            >
              {CATEGORIES.filter((c) => c.value).map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="URL du fichier (Cloudflare R2)"
            placeholder="https://..."
            value={form.fileUrl}
            onChange={(e) => setForm((p) => ({ ...p, fileUrl: e.target.value }))}
            required
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setSlideOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" className="flex-1" loading={createMutation.isPending}>
              Ajouter
            </Button>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
