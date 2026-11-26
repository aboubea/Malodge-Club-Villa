import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  MapPin,
  Users,
  BedDouble,
  Bath,
  Sparkles,
  ChevronDown,
  Pencil,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';
import { VillaDto } from '@malodge/shared';
import { cn } from '../../lib/utils';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useMediaQuery } from '../../hooks/useMediaQuery';

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`;
}

function VillaRow({
  villa,
  selected,
  onClick,
}: {
  villa: VillaDto;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group w-full text-left flex gap-4 p-3 rounded-2xl border bg-surface transition-all duration-200',
        selected
          ? 'border-transparent shadow-pop ring-1 ring-line'
          : 'border-line hover:border-line-strong hover:shadow-card',
      )}
    >
      <div className="relative w-[124px] sm:w-[148px] aspect-[4/3] rounded-xl overflow-hidden bg-surface-2 shrink-0">
        {villa.coverImage ? (
          <img
            src={villa.coverImage}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 size={26} className="text-line-strong" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col py-0.5">
        <p className="text-[12px] text-muted truncate">
          {villa.city}, {villa.country}
        </p>
        <p className="text-[15px] font-bold text-ink truncate mt-0.5">{villa.name}</p>
        <p className="text-[12.5px] text-muted mt-1 truncate">
          {plural(villa.bedrooms, 'chambre', 'chambres')} • {plural(villa.maxGuests, 'voyageur', 'voyageurs')} •{' '}
          {plural(villa.bathrooms, 'sdb', 'sdb')}
        </p>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <Sparkles size={13} className="text-muted" />
            {plural(Array.isArray(villa.amenities) ? villa.amenities.length : 0, 'équipement', 'équipements')}
          </span>
          <Badge variant={villa.isActive ? 'active' : 'inactive'}>{villa.isActive ? 'Active' : 'Inactive'}</Badge>
        </div>
      </div>
    </button>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
        <Icon size={17} className="text-ink-soft" />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-muted leading-tight">{label}</p>
        <p className="text-[15px] font-bold text-ink leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function VillaPreview({
  villa,
  onOpen,
  onEdit,
  onDelete,
}: {
  villa: VillaDto;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const images = [villa.coverImage, ...(villa.images ?? [])].filter(
    (src, i, arr): src is string => !!src && arr.indexOf(src) === i,
  );
  const [active, setActive] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(true);
  useEffect(() => setActive(0), [villa.id]);
  const amenities: string[] = Array.isArray(villa.amenities) ? (villa.amenities as string[]) : [];
  const thumbs = images.slice(0, 4).filter((_, i) => i !== active).slice(0, 3);

  return (
    <motion.div
      key={villa.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-3xl border border-line bg-surface p-5 sm:p-6"
    >
      {/* Gallery */}
      <div
        className={cn(
          'grid gap-3 h-[260px] sm:h-[300px]',
          images.length > 1 ? 'grid-cols-[minmax(0,1fr)_96px] sm:grid-cols-[minmax(0,1fr)_120px]' : 'grid-cols-1',
        )}
      >
        <div className="relative rounded-2xl overflow-hidden bg-surface-2">
          {images[active] ? (
            <img src={images[active]} alt={villa.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Building2 size={44} className="text-line-strong" />
            </div>
          )}
          {images.length > 1 && (
            <span className="absolute top-3 right-3 px-2.5 h-6 inline-flex items-center rounded-full bg-surface/90 text-[11.5px] font-semibold text-ink tabular">
              {active + 1} / {images.length}
            </span>
          )}
        </div>
        {images.length > 1 && (
        <div className="grid grid-rows-3 gap-3">
          {[0, 1, 2].map((i) => {
            const src = thumbs[i];
            return src ? (
              <button
                key={i}
                type="button"
                onClick={() => setActive(images.indexOf(src))}
                className="rounded-xl overflow-hidden bg-surface-2 hover:opacity-90 transition-opacity"
                aria-label={`Photo ${images.indexOf(src) + 1}`}
              >
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ) : (
              <div key={i} className="rounded-xl bg-surface-2" />
            );
          })}
        </div>
        )}
      </div>

      {/* Title */}
      <div className="flex items-start justify-between gap-4 mt-5">
        <div className="min-w-0">
          <h2 className="text-[20px] font-bold text-ink tracking-tight truncate">{villa.name}</h2>
          <p className="flex items-center gap-1.5 text-[13px] text-muted mt-1">
            <MapPin size={14} className="shrink-0" />
            <span className="truncate">{[villa.address, villa.city, villa.country].filter(Boolean).join(', ')}</span>
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpen} className="shrink-0">
          Voir la fiche <ArrowUpRight size={14} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 mt-5 border-y border-line">
        <Stat icon={BedDouble} label="Chambres" value={villa.bedrooms} />
        <Stat icon={Bath} label="Salles de bain" value={villa.bathrooms} />
        <Stat icon={Users} label="Voyageurs" value={villa.maxGuests} />
        <Stat icon={Sparkles} label="Équipements" value={amenities.length} />
      </div>

      {/* Details */}
      <div className="py-4">
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="w-full flex items-center justify-between text-[14px] font-bold text-ink"
          aria-expanded={detailsOpen}
        >
          Détails de la villa
          <ChevronDown size={18} className={cn('text-muted transition-transform', detailsOpen && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <p className="text-[13px] text-muted leading-relaxed mt-2 line-clamp-3">
                {villa.description?.replace(/<[^>]+>/g, ' ').trim() || 'Aucune description pour cette villa.'}
              </p>
              {amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {amenities.slice(0, 8).map((a) => (
                    <span key={a} className="h-7 px-3 inline-flex items-center rounded-full bg-surface-2 text-[12px] text-ink-soft">
                      {a}
                    </span>
                  ))}
                  {amenities.length > 8 && (
                    <span className="h-7 px-3 inline-flex items-center rounded-full text-[12px] text-muted">
                      +{amenities.length - 8}
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status panel */}
      <div className="rounded-2xl bg-peach p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[15px] font-bold text-ink">{villa.isActive ? 'Villa active' : 'Villa inactive'}</p>
          <p className="text-[12.5px] text-ink-soft mt-0.5">
            {villa.isActive ? 'Visible pour les réservations et les services.' : 'Masquée des réservations et des services.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={onEdit}>
            Modifier
          </Button>
          <button
            type="button"
            onClick={onDelete}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-surface/70 transition-colors"
            aria-label="Supprimer la villa"
            title="Supprimer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

interface VillaListViewProps {
  villas: VillaDto[];
  onOpen: (villa: VillaDto) => void;
  onEdit: (villa: VillaDto) => void;
  onDelete: (villa: VillaDto) => void;
}

/** Master–detail layout on wide screens; a simple list that opens the villa page elsewhere. */
export function VillaListView({ villas, onOpen, onEdit, onDelete }: VillaListViewProps) {
  const wide = useMediaQuery('(min-width: 1280px)');
  const [selectedId, setSelectedId] = useState<string | null>(villas[0]?.id ?? null);
  const selected = villas.find((v) => v.id === selectedId) ?? villas[0];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
      <div className="space-y-3">
        <p className="text-[13px] text-muted px-1">
          <span className="font-bold text-ink">{villas.length}</span> villa{villas.length > 1 ? 's' : ''} affichée
          {villas.length > 1 ? 's' : ''}
        </p>
        {villas.map((villa) => (
          <VillaRow
            key={villa.id}
            villa={villa}
            selected={wide && selected?.id === villa.id}
            onClick={() => (wide ? setSelectedId(villa.id) : onOpen(villa))}
          />
        ))}
      </div>
      {wide && selected && (
        <div className="sticky top-0">
          <VillaPreview
            villa={selected}
            onOpen={() => onOpen(selected)}
            onEdit={() => onEdit(selected)}
            onDelete={() => onDelete(selected)}
          />
        </div>
      )}
    </div>
  );
}
