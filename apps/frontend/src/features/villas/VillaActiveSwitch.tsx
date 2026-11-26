import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiClient } from '../../lib/apiClient';
import { cn } from '../../lib/utils';

/** One click to make a villa active or inactive (its Lodgify formulas follow). */
export function VillaActiveSwitch({ villaId, active, size = 'md' }: { villaId: string; active: boolean; size?: 'sm' | 'md' }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => apiClient.patch(`/villas/${villaId}`, { isActive }),
    onSuccess: (_r, isActive) => {
      toast.success(isActive ? 'Villa active' : 'Villa inactive');
      qc.invalidateQueries({ queryKey: ['villas'] });
      qc.invalidateQueries({ queryKey: ['villa', villaId] });
    },
  });
  const on = toggle.isPending ? !!toggle.variables : active;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? 'Villa active : cliquer pour la désactiver' : 'Villa inactive : cliquer pour l’activer'}
      title={on ? 'Active : cliquer pour désactiver' : 'Inactive : cliquer pour activer'}
      disabled={toggle.isPending}
      // Inside clickable / draggable cards: the switch only switches.
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate(!active);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      draggable={false}
      // The drag-and-drop card ignores pointer events on its content: the switch takes them back.
      className="pointer-events-auto inline-flex items-center gap-2 shrink-0"
    >
      <span className={cn('text-[12px] font-semibold', on ? 'text-success' : 'text-muted')}>{on ? 'Active' : 'Inactive'}</span>
      <span
        className={cn(
          'relative inline-flex items-center rounded-full transition-colors',
          size === 'sm' ? 'w-8 h-[18px]' : 'w-10 h-[22px]',
          on ? 'bg-success' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute rounded-full bg-white shadow transition-transform',
            size === 'sm' ? 'w-[14px] h-[14px] left-[2px]' : 'w-[18px] h-[18px] left-[2px]',
            on && (size === 'sm' ? 'translate-x-[14px]' : 'translate-x-[18px]'),
          )}
        />
      </span>
    </button>
  );
}
