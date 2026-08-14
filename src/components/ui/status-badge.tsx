import { cn } from '@/lib/utils';

type StatusTone = 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'orange' | 'teal';

const TONE_STYLES: Record<StatusTone, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-blue-100 text-blue-800 border-blue-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  green: 'bg-green-100 text-green-800 border-green-200',
  red: 'bg-red-100 text-red-800 border-red-200',
  purple: 'bg-purple-100 text-purple-800 border-purple-200',
  orange: 'bg-orange-100 text-orange-800 border-orange-200',
  teal: 'bg-teal-100 text-teal-800 border-teal-200',
};

// Checked in order — first match wins. Keep more specific phrases above their
// broader/looser neighbors (e.g. "pending review" above bare "pending").
const STATUS_TONE_RULES: Array<[RegExp, StatusTone]> = [
  [/cancel|reject|fail|overdue|scrap|blocked|inactive/i, 'red'],
  [/complet|approv|paid|accept|deliver|active|operational|posted|pass|resolved|closed|invoiced/i, 'green'],
  [/progress|partial|^due$| due$|pending review/i, 'amber'],
  [/hold|expired|paus/i, 'orange'],
  [/production|processing|running|invoicing/i, 'purple'],
  [/assign|confirm|receiv|sent|schedul|dispatch|transit/i, 'blue'],
];

function toneForStatus(status: string): StatusTone {
  for (const [re, tone] of STATUS_TONE_RULES) {
    if (re.test(status)) return tone;
  }
  return 'slate';
}

export interface StatusBadgeProps {
  status: string;
  className?: string;
  /** Override the auto-detected color when a status needs a specific tone. */
  tone?: StatusTone;
}

export function StatusBadge({ status, className, tone }: StatusBadgeProps) {
  const resolvedTone = tone ?? toneForStatus(status || '');
  return (
    <span
      className={cn(
        'inline-flex min-w-[92px] items-center justify-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium leading-none',
        TONE_STYLES[resolvedTone],
        className,
      )}
    >
      {status || '—'}
    </span>
  );
}
