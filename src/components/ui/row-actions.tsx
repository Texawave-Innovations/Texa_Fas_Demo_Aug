import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  hidden?: boolean;
}

interface RowActionsProps {
  actions: RowAction[];
  className?: string;
}

const CLOSE_DELAY_MS = 150;

/** Single three-dot trigger that reveals row actions as aligned icon buttons on hover or click. */
export function RowActions({ actions, className }: RowActionsProps) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => () => clearTimeout(closeTimer.current), []);

  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  const openNow = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn('h-8 w-8', className)}
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        className="flex w-auto flex-row items-center gap-1 p-1"
      >
        {visible.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.label}
              size="icon"
              variant="ghost"
              title={action.label}
              disabled={action.disabled}
              className={cn('h-8 w-8', action.className)}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
                setOpen(false);
              }}
            >
              <Icon className="h-4 w-4" />
              <span className="sr-only">{action.label}</span>
            </Button>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
