/**
 * Apple segmented control: a light grey track, the chosen segment raised in white
 * (lighter grey in dark mode). For exclusive views (period, tab, currency…).
 * For filters that narrow a list, use chips instead (selected = dark pill).
 */
export const segTrack = 'inline-flex items-center gap-0.5 p-1 rounded-full bg-surface-2 max-w-full overflow-x-auto scrollbar-none';
export const segItem = 'h-8 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all';
export const segOn = 'bg-surface dark:bg-line-strong text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]';
export const segOff = 'text-muted hover:text-ink';
/** Airbnb filter chip. */
export const chip = 'inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13.5px] font-semibold border whitespace-nowrap transition-colors';
export const chipOn = 'border-ink bg-ink text-surface';
export const chipOff = 'border-line-strong bg-surface text-ink hover:border-ink/50';
