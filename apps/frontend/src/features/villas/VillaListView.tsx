import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Pencil,
  Trash2,
  ArrowUpRight,
  Link2,
  MoreHorizontal,
  GripVertical,
  Layers,
} from 'lucide-react';
import { VillaDto } from '@malodge/shared';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { VillaActiveSwitch } from './VillaActiveSwitch';

function plural(n: number, one: string, many: string) {
  return `${n} ${n > 1 ? many : one}`;
}

/** Capacity line; 0 means Lodgify did not give the figure. */
function capacityLine(v: VillaDto) {
  const parts = [
    v.bedrooms > 0 && plural(v.bedrooms, 'chambre', 'chambres'),
    v.maxGuests > 0 && plural(v.maxGuests, 'voyageur', 'voyageurs'),
    v.bathrooms > 0 && plural(v.bathrooms, 'sdb', 'sdb'),
  ].filter(Boolean);
  return parts.length ? parts.join(' • ') : 'Capacité non renseignée';
}

/** 'group*': two Lodgify listings, dropped one on the other they become formulas of one house. */
type DropState = 'idle' | 'dragging' | 'target' | 'over' | 'group' | 'group-over';

/** One villa, Airbnb style: a big photo, its name and place, its capacity; drag it onto a duplicate to merge. */
function VillaCard({
  villa,
  onOpen,
  menu,
  drag,
}: {
  villa: VillaDto;
  onOpen: () => void;
  menu: React.ReactNode;
  drag?: { state: DropState; handlers: React.HTMLAttributes<HTMLDivElement> & { draggable: boolean } };
}) {
  const state = drag?.state ?? 'idle';
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpen();
        }
      }}
      {...drag?.handlers}
      className={cn(
        'group relative rounded-[22px] p-2 -m-2 transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        drag?.handlers.draggable && 'active:cursor-grabbing',
        state === 'dragging' && 'opacity-40',
        state === 'target' && 'ring-2 ring-dashed ring-accent/40',
        state === 'over' && 'ring-2 ring-accent bg-peach/60',
        state === 'group' && 'ring-2 ring-info/40',
        state === 'group-over' && 'ring-2 ring-info bg-info/5',
      )}
    >
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-surface-2">
        {villa.coverImage ? (
          <img src={villa.coverImage} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04] pointer-events-none" />
        ) : (
          <div className="w-full h-full flex items-center justify-center pointer-events-none">
            <Building2 size={34} className="text-line-strong" />
          </div>
        )}
        {/* On the photo: Lodgify, the on/off switch, the menu */}
        {villa.logifyId && (
          <span className="absolute top-3 left-3 h-7 px-2.5 rounded-full bg-surface/95 text-[12px] font-semibold text-ink inline-flex items-center shadow-card pointer-events-none">Lodgify</span>
        )}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="h-8 pl-2.5 pr-1 rounded-full bg-surface/95 shadow-card inline-flex items-center">
            <VillaActiveSwitch villaId={villa.id} active={villa.isActive} size="sm" />
          </span>
          {menu}
        </div>
        {!villa.isActive && <div className="absolute inset-0 bg-canvas/45 pointer-events-none" />}
        {state === 'over' && (
          <span className="absolute inset-x-3 bottom-3 h-8 inline-flex items-center justify-center gap-1.5 rounded-full bg-accent text-on-accent text-[12.5px] font-semibold pointer-events-none">
            <Link2 size={13} /> Déposer pour fusionner
          </span>
        )}
        {state === 'group-over' && (
          <span className="absolute inset-x-3 bottom-3 h-8 inline-flex items-center justify-center gap-1.5 rounded-full bg-info text-white text-[12.5px] font-semibold pointer-events-none">
            <Layers size={13} /> Déposer pour regrouper
          </span>
        )}
      </div>
      <div className="pt-3 px-1 pointer-events-none">
        <p className="text-[15px] font-semibold text-ink truncate">{villa.name}</p>
        <p className="text-[13.5px] text-muted truncate">
          {[villa.city, villa.country].filter(Boolean).join(', ')}
        </p>
        <p className="text-[13.5px] text-ink-soft truncate mt-0.5">{capacityLine(villa)}</p>
        {!!villa.formulas?.length && (
          <p className="text-[12.5px] text-info mt-0.5 truncate">
            + {villa.formulas.length} formule{villa.formulas.length > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

/** The "⋯" of a card: open, edit, merge with another villa (also without dragging), delete. */
function CardMenu({ villa, onOpen, onEdit, onDelete, others, onMergeWith }: { villa: VillaDto; onOpen: () => void; onEdit: () => void; onDelete: () => void; others?: VillaDto[]; onMergeWith?: (other: VillaDto) => void }) {
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const item = 'w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-[14px] text-left hover:bg-surface-2';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Actions pour ${villa.name}`} className="w-8 h-8 rounded-full bg-surface/95 shadow-card inline-flex items-center justify-center text-ink hover:bg-surface">
        <MoreHorizontal size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.97 }} transition={{ duration: 0.12 }} className="absolute right-0 top-10 z-20 w-56 rounded-2xl border border-line bg-surface shadow-pop p-1.5">
            <button type="button" className={item} onClick={onOpen}>
              <ArrowUpRight size={15} className="text-muted" /> Ouvrir la fiche
            </button>
            <button type="button" className={item} onClick={() => { setOpen(false); onEdit(); }}>
              <Pencil size={15} className="text-muted" /> Modifier
            </button>
            {onMergeWith && others && others.length > 0 && (
              <button type="button" className={item} onClick={() => setMerging((m) => !m)}>
                <Link2 size={15} className="text-muted" /> Fusionner avec…
              </button>
            )}
            {merging && onMergeWith && others && (
              <select
                autoFocus
                defaultValue=""
                onChange={(e) => {
                  const other = others.find((o) => o.id === e.target.value);
                  if (other) {
                    setOpen(false);
                    setMerging(false);
                    onMergeWith(other);
                  }
                }}
                className="mx-1.5 my-1 w-[calc(100%-12px)] h-10 px-3 rounded-xl border border-line-strong bg-surface text-[13.5px]"
              >
                <option value="" disabled>
                  Choisir la villa…
                </option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <div className="my-1 h-px bg-line" />
            <button type="button" className={cn(item, 'text-danger hover:bg-danger/10')} onClick={() => { setOpen(false); onDelete(); }}>
              <Trash2 size={15} /> Supprimer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface VillaListViewProps {
  villas: VillaDto[];
  onOpen: (villa: VillaDto) => void;
  onEdit: (villa: VillaDto) => void;
  onDelete: (villa: VillaDto) => void;
  /** Enables merging duplicates: a villa dragged onto another one. */
  onMergeRequest?: (dragged: VillaDto, onto: VillaDto) => void;
  /** Villa to show in the preview (e.g. the one kept after a merge). */
  focusId?: string | null;
}

/** The villas as a grid of photo cards (Airbnb); a card opens the villa page. */
export function VillaListView({ villas, onOpen, onEdit, onDelete, onMergeRequest, focusId }: VillaListViewProps) {
  const wide = useMediaQuery('(min-width: 1024px)');
  useEffect(() => {
    if (focusId) document.getElementById(`villa-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusId]);

  // Drag a villa onto its duplicate to merge them; two Lodgify listings are grouped as formulas instead.
  // The ref is read by the drag events (set at once), the state drives the styling.
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragged = villas.find((v) => v.id === dragId) ?? null;
  const draggedNow = () => villas.find((v) => v.id === dragRef.current) ?? null;
  const asFormulas = (from: VillaDto | null, v: VillaDto) => !!from && !!from.logifyId && !!v.logifyId;
  const endDrag = () => {
    dragRef.current = null;
    setDragId(null);
    setOverId(null);
  };
  const dragFor = (villa: VillaDto) => {
    if (!onMergeRequest) return undefined;
    const state: DropState = !dragged
      ? 'idle'
      : dragged.id === villa.id
        ? 'dragging'
        : asFormulas(dragged, villa)
          ? overId === villa.id
            ? 'group-over'
            : 'group'
          : overId === villa.id
            ? 'over'
            : 'target';
    return {
      state,
      handlers: {
        draggable: true,
        onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
          e.dataTransfer.effectAllowed = 'link';
          e.dataTransfer.setData('text/plain', villa.id);
          dragRef.current = villa.id;
          setDragId(villa.id);
        },
        onDragEnd: endDrag,
        onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
          const from = draggedNow();
          if (!from || from.id === villa.id) return;
          if (overId !== villa.id) setOverId(villa.id);
          e.preventDefault();
          e.dataTransfer.dropEffect = 'link';
        },
        onDragLeave: (e: React.DragEvent<HTMLDivElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverId((id) => (id === villa.id ? null : id));
        },
        onDrop: (e: React.DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          const from = villas.find((v) => v.id === (dragRef.current || e.dataTransfer.getData('text/plain')));
          endDrag();
          if (from && from.id !== villa.id) onMergeRequest(from, villa);
        },
      },
    };
  };

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          <span className="font-semibold text-ink">{villas.length}</span> villa{villas.length > 1 ? 's' : ''}
        </span>
        {onMergeRequest && wide && (
          <span className="inline-flex items-center gap-1 text-[12.5px]">
            <GripVertical size={13} /> Glissez une villa sur son doublon pour les fusionner
          </span>
        )}
      </p>
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-8">
        {villas.map((villa) => (
          <div key={villa.id} id={`villa-${villa.id}`}>
            <VillaCard
              villa={villa}
              onOpen={() => onOpen(villa)}
              drag={wide ? dragFor(villa) : undefined}
              menu={
                <CardMenu
                  villa={villa}
                  onOpen={() => onOpen(villa)}
                  onEdit={() => onEdit(villa)}
                  onDelete={() => onDelete(villa)}
                  others={onMergeRequest ? villas.filter((v) => v.id !== villa.id) : undefined}
                  onMergeWith={onMergeRequest ? (other) => onMergeRequest(villa, other) : undefined}
                />
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
