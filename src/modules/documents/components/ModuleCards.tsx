// src/modules/documents/components/ModuleCards.tsx
import React from 'react';
import { ShoppingCart, Users, Package, ClipboardCheck } from 'lucide-react';
import { FasModuleConfig, FasModuleId, SelectedItemMap } from '../documentTypes';
import { cn } from '@/lib/utils';

interface ModuleCardsProps {
  modules: FasModuleConfig[];
  activeModuleId: FasModuleId;
  onSelectModule: (id: FasModuleId) => void;
  selectedItems: SelectedItemMap;
}

const iconMap: Record<string, React.ElementType> = {
  ShoppingCart,
  Users,
  Package,
  ClipboardCheck,
};

export const ModuleCards: React.FC<ModuleCardsProps> = ({
  modules,
  activeModuleId,
  onSelectModule,
  selectedItems,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {modules.map((mod) => {
        const Icon = iconMap[mod.iconName] || ShoppingCart;
        const isActive = activeModuleId === mod.id;

        // Count how many items in this module are selected
        const selectedCountInModule = Object.values(selectedItems).filter(
          (item) => item.moduleId === mod.id
        ).length;

        return (
          <div
            key={mod.id}
            onClick={() => onSelectModule(mod.id)}
            className={cn(
              'relative rounded-2xl p-4 cursor-pointer transition-all duration-200 border text-left select-none',
              isActive
                ? 'bg-card border-primary/70 shadow-sm ring-1 ring-primary/30'
                : 'bg-card/70 hover:bg-card border-border/70 hover:border-border hover:shadow-sm'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-10 w-10 rounded-xl flex items-center justify-center transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">{mod.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {mod.tabs.length} Tabs Available
                  </p>
                </div>
              </div>

              {selectedCountInModule > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground shadow-sm">
                  {selectedCountInModule} Selected
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

