// src/modules/documents/components/BatchActionBar.tsx
import React from 'react';
import { CheckSquare, Square, Filter, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface BatchActionBarProps {
  tabRecordCount: number;
  selectedInTabCount: number;
  totalSelectedCount: number;
  onSelectAllToggle: () => void;
  isAllInTabSelected: boolean;
  onClearAll: () => void;
  onDownloadZip: () => void;
  selectedMonth: string;
  isExporting: boolean;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  tabRecordCount,
  selectedInTabCount,
  totalSelectedCount,
  onSelectAllToggle,
  isAllInTabSelected,
  onClearAll,
  onDownloadZip,
  selectedMonth,
  isExporting,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 rounded-xl px-4 py-2.5 border border-border/60">
      {/* Left: Select all checkbox & counter */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSelectAllToggle}
          className="flex items-center gap-2 text-xs font-semibold text-foreground hover:text-primary transition-colors cursor-pointer select-none"
        >
          {isAllInTabSelected && tabRecordCount > 0 ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
          <span>Select All in this Tab ({tabRecordCount} records)</span>
        </button>

        {tabRecordCount > 0 && (
          <span className="text-[11px] text-muted-foreground bg-white px-2 py-0.5 rounded-md border border-border/50">
            {selectedInTabCount} of {tabRecordCount} in this tab selected
          </span>
        )}
      </div>

      {/* Middle & Right: Filter tag & Batch Action Pill */}
      <div className="flex items-center gap-3 self-end sm:self-center">
        {selectedMonth !== 'all' && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3 w-3 text-primary" />
            <span>Filtering month: </span>
            <span className="font-semibold text-foreground">{selectedMonth}</span>
          </div>
        )}

        {/* Dark / Accent Action Pill */}
        {totalSelectedCount > 0 && (
          <div className="flex items-center gap-2 bg-foreground text-background pl-2.5 pr-1.5 py-1 rounded-xl shadow-sm animate-fade-in">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold whitespace-nowrap">
              {totalSelectedCount} Selected
            </span>

            <button
              onClick={onClearAll}
              className="text-[11px] text-muted-foreground hover:text-white px-1.5 py-0.5 transition-colors"
            >
              Clear
            </button>

            <Button
              size="sm"
              onClick={onDownloadZip}
              disabled={isExporting}
              className="h-7 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting ? 'Packaging...' : 'Download Package (.ZIP)'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

