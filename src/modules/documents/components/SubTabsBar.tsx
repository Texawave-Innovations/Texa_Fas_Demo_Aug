// src/modules/documents/components/SubTabsBar.tsx
import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FasSubTabConfig, FasDocumentItem, SelectedItemMap } from '../documentTypes';
import { cn } from '@/lib/utils';

interface SubTabsBarProps {
  tabs: FasSubTabConfig[];
  activeSubTabId: string;
  onSelectSubTab: (id: string) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  documents: FasDocumentItem[];
  selectedItems: SelectedItemMap;
}

export const SubTabsBar: React.FC<SubTabsBarProps> = ({
  tabs,
  activeSubTabId,
  onSelectSubTab,
  searchQuery,
  onSearchChange,
  documents,
  selectedItems,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card rounded-2xl border border-border/70 p-2.5 shadow-sm">
      {/* Sub tabs list */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1">
        {tabs.map((tab) => {
          const isActive = activeSubTabId === tab.id;

          // Count how many records match this subtab
          const tabCount = documents.filter((d) => d.subTabId === tab.id).length;

          // Count how many items in this tab are selected
          const selectedInTabCount = Object.values(selectedItems).filter(
            (i) => i.subTabId === tab.id
          ).length;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectSubTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              <span>{tab.label}</span>
              {selectedInTabCount > 0 ? (
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.2 rounded-full font-bold',
                    isActive
                      ? 'bg-white text-primary'
                      : 'bg-primary text-white'
                  )}
                >
                  {selectedInTabCount}
                </span>
              ) : tabCount > 0 ? (
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.2 rounded-full font-medium',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {tabCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Search Input on the right */}
      <div className="relative w-full md:w-72 shrink-0 px-1">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search document / party / code..."
          className="h-9 pl-9 pr-3 text-xs rounded-xl bg-muted/30 border-border/70 focus-visible:ring-primary/40"
        />
      </div>
    </div>
  );
};

