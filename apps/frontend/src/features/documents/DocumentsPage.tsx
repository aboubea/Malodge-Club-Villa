import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  FileText,
  Download,
  Cpu,
  Trash2,
  Plus,
  MoreVertical,
  FileSpreadsheet,
  File,
  FolderOpen,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { label: 'Tous', value: '' },
  { label: 'Villas', value: 'villas' },
  { label: 'Prestataires', value: 'providers' },
  { label: 'Contrats', value: 'contracts' },
  { label: 'Guides', value: 'guides' },
  { label: 'Factures', value: 'invoices' },
  { label: 'FAQ', value: 'faq' },
];

function getFileIcon(type: string) {
  if (type.includes('pdf'))
    return { Icon: FileText, color: 'text-red-400', bg: 'bg-red-400/10' };
  if (type.includes('sheet') || type.includes('xlsx') || type.includes('csv'))
    return { Icon: FileSpreadsheet, color: 'text-green-400', bg: 'bg-green-400/10' };
  return { Icon: File, color: 'text-blue-400', bg: 'bg-blue-400/10' };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function fetchDocuments(category?: string) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  const res = await apiClient.get(`/documents?${params.toString()}`);
  const d = res.data?.data ?? res.data;
  return d?.items ?? d ?? [];
}

interface AddDocumentForm {
  name: string;
  type: string;
  fileUrl: string;
  category: string;
  villaId: string;
}

export function DocumentsPage() {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [form, setForm] = useState<AddDocumentForm>({
    name: '',
    type: 'application/pdf',
    fileUrl: '',
    category: 'general',
    villaId: '',
  });
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', selectedCategory],
    queryFn: () => fetchDocuments(selectedCategory),
  });

  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/documents', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowAdd(false);
      setForm({ name: '', type: 'application/pdf', fileUrl: '', category: 'general', villaId: '' });
      toast.success('Document ajouté');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document supprimé');
    },
  });

  const ingestMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/documents/${id}/ingest`),
    onSuccess: () => toast.success('Indexation IA lancée'),
    onError: () => toast.error("Erreur lors de l'indexation"),
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Documents"
        description="Gérez et indexez vos documents pour le concierge IA"
      >
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus size={14} className="mr-1.5" />
          Ajouter un document
        </Button>
      </PageHeader>

      <div className="flex flex-1 overflow-hidden gap-4 px-5 pb-5">
        {/* Category sidebar */}
        <div className="w-44 shrink-0 space-y-0.5">
          <p className="text-[10px] text-[#6B6B6F] uppercase tracking-wider font-medium mb-2 px-2">
            Catégories
          </p>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors',
                selectedCategory === cat.value
                  ? 'bg-[#C9A96E]/10 text-[#C9A96E]'
                  : 'text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D]',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Document grid */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#1A1A1D] flex items-center justify-center">
                <FolderOpen size={20} className="text-[#6B6B6F]" />
              </div>
              <div>
                <p className="text-sm text-[#F5F0EB]">Aucun document</p>
                <p className="text-xs text-[#6B6B6F] mt-1">Ajoutez votre premier document</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {documents.map((doc: any, i: number) => {
                const { Icon, color, bg } = getFileIcon(doc.type);
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2 }}
                    className="bg-[#111113] border border-[#242428] rounded-xl p-4 hover:border-[#C9A96E]/20 transition-all duration-200 relative group"
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center mb-3',
                        bg,
                      )}
                    >
                      <Icon size={18} className={color} />
                    </div>

                    {/* Info */}
                    <p className="text-sm font-medium text-[#F5F0EB] truncate mb-1">{doc.name}</p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {doc.category && (
                        <Badge variant="default" className="text-[10px] py-0">
                          {doc.category}
                        </Badge>
                      )}
                      {doc.villa && (
                        <Badge
                          variant="gold"
                          className="text-[10px] py-0"
                        >
                          {doc.villa.name}
                        </Badge>
                      )}
                      <Badge variant="default" className="text-[10px] py-0">
                        v{doc.version}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-[#6B6B6F]">{formatDate(doc.createdAt)}</p>

                    {/* Action menu */}
                    <div className="absolute top-3 right-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === doc.id ? null : doc.id);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <MoreVertical size={13} />
                      </button>
                      {openMenuId === doc.id && (
                        <div className="absolute right-0 top-8 bg-[#111113] border border-[#242428] rounded-xl shadow-xl z-10 py-1 w-44">
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 px-3 py-2 text-xs text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors"
                            onClick={() => setOpenMenuId(null)}
                          >
                            <Download size={12} /> Télécharger
                          </a>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              ingestMutation.mutate(doc.id);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors"
                          >
                            <Cpu size={12} /> Indexer pour l'IA
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              if (confirm('Supprimer ce document ?'))
                                deleteMutation.mutate(doc.id);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 size={12} /> Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Document Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Ajouter un document" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#6B6B6F] mb-1.5">Nom du document *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Guide d'accueil Villa Émeraude"
              className="w-full h-9 px-3 rounded-lg text-sm bg-[#1A1A1D] border border-[#242428] text-[#F5F0EB] placeholder:text-[#6B6B6F] focus:outline-none focus:border-[#C9A96E]/40"
            />
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6F] mb-1.5">Type de fichier</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full h-9 px-3 rounded-lg text-sm bg-[#1A1A1D] border border-[#242428] text-[#F5F0EB] focus:outline-none focus:border-[#C9A96E]/40"
            >
              <option value="application/pdf">PDF</option>
              <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                Word (DOCX)
              </option>
              <option value="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                Excel (XLSX)
              </option>
              <option value="text/plain">Texte</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6F] mb-1.5">Catégorie</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full h-9 px-3 rounded-lg text-sm bg-[#1A1A1D] border border-[#242428] text-[#F5F0EB] focus:outline-none focus:border-[#C9A96E]/40"
            >
              <option value="general">Général</option>
              <option value="villas">Villas</option>
              <option value="providers">Prestataires</option>
              <option value="contracts">Contrats</option>
              <option value="guides">Guides</option>
              <option value="invoices">Factures</option>
              <option value="faq">FAQ</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#6B6B6F] mb-1.5">URL du fichier (R2) *</label>
            <input
              value={form.fileUrl}
              onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
              placeholder="https://r2.example.com/documents/guide.pdf"
              className="w-full h-9 px-3 rounded-lg text-sm bg-[#1A1A1D] border border-[#242428] text-[#F5F0EB] placeholder:text-[#6B6B6F] focus:outline-none focus:border-[#C9A96E]/40"
            />
          </div>
          <Button
            className="w-full"
            disabled={!form.name || !form.fileUrl || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Ajout en cours...' : 'Ajouter le document'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
