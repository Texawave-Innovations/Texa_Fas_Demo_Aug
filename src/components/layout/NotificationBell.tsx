// src/components/layout/NotificationBell.tsx
// Login-wide reminders (not locked behind opening the AI chat): invoices/bills
// due today, overdue money, and low stock. Polls periodically and pops one
// toast per browser session the first time it finds something outstanding.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, AlertTriangle, Clock, PackageX, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  gatherReminders, reminderCount, labelFor, BILLS_TABLE, INVOICES_TABLE,
  type RemindersBundle,
} from '@/lib/reminders';

const REFRESH_MS = 5 * 60 * 1000;
const ANNOUNCED_KEY = 'fas_reminders_announced';

type Row = { key: string; label: string; tone: 'due' | 'overdue' | 'stock'; path: string };

function buildRows(b: RemindersBundle): Row[] {
  const rows: Row[] = [];
  b.dueTodayInvoices.forEach((r, i) => rows.push({ key: `dti${i}`, label: `Invoice due today — ${labelFor(r, INVOICES_TABLE)}`, tone: 'due', path: '/sales/invoices' }));
  b.dueTodayBills.forEach((r, i) => rows.push({ key: `dtb${i}`, label: `Bill due today — ${labelFor(r, BILLS_TABLE)}`, tone: 'due', path: '/finance/expenses' }));
  b.overdueInvoices.forEach((r, i) => rows.push({ key: `oi${i}`, label: `Overdue invoice — ${labelFor(r, INVOICES_TABLE)}`, tone: 'overdue', path: '/sales/invoices' }));
  b.overdueBills.forEach((r, i) => rows.push({ key: `ob${i}`, label: `Overdue bill — ${labelFor(r, BILLS_TABLE)}`, tone: 'overdue', path: '/finance/expenses' }));
  b.fgAlerts.forEach((a, i) => rows.push({ key: `fg${i}`, label: `${a.label} — ${a.qty}${a.uom ? ` ${a.uom}` : ''} left`, tone: 'stock', path: '/inventory/finished-goods' }));
  b.rawAlerts.forEach((a, i) => rows.push({ key: `raw${i}`, label: `${a.label} — ${a.qty} left`, tone: 'stock', path: '/inventory/raw-materials' }));
  return rows;
}

const TONE_STYLES: Record<Row['tone'], { icon: typeof Clock; badge: string; iconColor: string }> = {
  due: { icon: Clock, badge: 'bg-amber-50 border-amber-100', iconColor: 'text-amber-600' },
  overdue: { icon: AlertTriangle, badge: 'bg-red-50 border-red-100', iconColor: 'text-red-600' },
  stock: { icon: PackageX, badge: 'bg-orange-50 border-orange-100', iconColor: 'text-orange-600' },
};

export const NotificationBell = () => {
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<RemindersBundle | null>(null);
  const [open, setOpen] = useState(false);
  const announcedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const b = await gatherReminders();
        if (cancelled) return;
        setBundle(b);
        const count = reminderCount(b);
        if (count > 0 && !announcedRef.current && sessionStorage.getItem(ANNOUNCED_KEY) !== '1') {
          announcedRef.current = true;
          sessionStorage.setItem(ANNOUNCED_KEY, '1');
          const dueToday = b.dueTodayInvoices.length + b.dueTodayBills.length;
          const overdue = b.overdueInvoices.length + b.overdueBills.length;
          const bits = [
            dueToday > 0 && `${dueToday} due today`,
            overdue > 0 && `${overdue} overdue`,
            (b.fgAlerts.length + b.rawAlerts.length) > 0 && `${b.fgAlerts.length + b.rawAlerts.length} low stock`,
          ].filter(Boolean).join(' · ');
          toast(`${count} item${count === 1 ? '' : 's'} need attention`, {
            description: bits,
            icon: <Bell className="h-4 w-4" />,
          });
        }
      } catch (err) {
        console.error('Failed to load reminders:', err);
      }
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const count = bundle ? reminderCount(bundle) : 0;
  const rows = bundle ? buildRows(bundle) : [];

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
          <Bell className="h-[18px] w-[18px] text-muted-foreground" />
          {count > 0 && (
            <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 px-0.5 flex items-center justify-center border-2 border-white">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-3 border-b bg-muted/30">
          <span className="text-sm font-semibold">Reminders</span>
          <span className="text-[11px] text-muted-foreground">{count} outstanding</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 px-4">
            {bundle ? '✅ All clear — nothing needs attention right now.' : 'Loading…'}
          </p>
        ) : (
          <ScrollArea className={rows.length > 5 ? 'h-72' : ''}>
            <div className="divide-y">
              {rows.map((row) => {
                const style = TONE_STYLES[row.tone];
                const Icon = style.icon;
                return (
                  <button
                    key={row.key}
                    onClick={() => go(row.path)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className={`h-7 w-7 shrink-0 rounded-full border flex items-center justify-center ${style.badge}`}>
                      <Icon className={`h-3.5 w-3.5 ${style.iconColor}`} />
                    </div>
                    <span className="text-xs text-foreground flex-1 truncate">{row.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
};
