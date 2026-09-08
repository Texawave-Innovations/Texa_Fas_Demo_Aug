// src/modules/documents/components/DocumentHeader.tsx
import React from 'react';
import { FolderArchive, Calendar, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DocumentHeaderProps {
  selectedMonth: string;
  onMonthChange: (value: string) => void;
  onClearMonth: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  selectedMonth,
  onMonthChange,
  onClearMonth,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <div className="bg-card rounded-2xl border border-border/70 p-5 shadow-sm transition-all duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Left Title block with Icon & Badge */}
        <div className="flex items-start gap-3.5">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-sm">
            <FolderArchive className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                Monthly Document Download Center
              </h1>
              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-300/80 text-[11px] font-medium px-2 py-0.5 rounded-full">
                Enterprise Export (Sales, HR, Inventory, Quality)
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              Select any ERP module, drill down into individual tabs, multi-select records with checkboxes, and batch export as structured ZIP.
            </p>
          </div>
        </div>

        {/* Right Controls: Month Selector, Clear, Refresh */}
        <div className="flex items-center gap-2.5 self-end lg:self-center">
          <div className="flex items-center bg-muted/50 border border-border/70 rounded-xl px-2.5 py-1 text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground mr-2 shrink-0" />
            <span className="text-muted-foreground font-medium mr-1.5 whitespace-nowrap">
              Month:
            </span>
            <Select value={selectedMonth} onValueChange={onMonthChange}>
              <SelectTrigger className="h-7 border-none bg-transparent shadow-none p-0 focus:ring-0 text-xs font-semibold text-foreground w-[130px]">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026-09">September, 2026</SelectItem>
                <SelectItem value="2026-08">August, 2026</SelectItem>
                <SelectItem value="2026-07">July, 2026</SelectItem>
                <SelectItem value="all">All Months</SelectItem>
              </SelectContent>
            </Select>
            {selectedMonth !== 'all' && (
              <button
                onClick={onClearMonth}
                title="Clear month filter"
                className="ml-2 text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="h-9 px-3.5 rounded-xl border-border/70 text-xs font-medium hover:bg-muted/60 transition-all gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
};

