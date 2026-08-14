import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: (string | Option)[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = '-- SELECT --',
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize options to { value, label } objects safely
  const normalizedOptions = React.useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt === 'ALL' ? '-- SELECT --' : opt };
      }
      if (opt && typeof opt === 'object') {
        return {
          value: opt.value !== undefined && opt.value !== null ? String(opt.value) : '',
          label: opt.label !== undefined && opt.label !== null ? String(opt.label) : '',
        };
      }
      return { value: '', label: '' };
    });
  }, [options]);

  const selectedOption = React.useMemo(() => {
    return normalizedOptions.find((opt) => opt.value === value);
  }, [normalizedOptions, value]);

  const filteredOptions = React.useMemo(() => {
    const term = search.toLowerCase();
    return normalizedOptions.filter((opt) => {
      const label = String(opt?.label || '').toLowerCase();
      const val = String(opt?.value || '').toLowerCase();
      return label.includes(term) || val.includes(term);
    });
  }, [normalizedOptions, search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  return (
    <div className={`relative ${className} ${open ? 'z-50' : ''}`} ref={containerRef}>
      <div
        className={`flex items-center justify-between border border-input rounded-md px-3 h-9 text-sm cursor-pointer bg-background ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-muted'
            : 'hover:border-accent-foreground/30 focus:outline-none focus:ring-1 focus:ring-ring'
        }`}
        onClick={() => !disabled && setOpen((p) => !p)}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground ml-2 opacity-50" />
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-popover text-popover-foreground border border-border rounded-md shadow-md bg-white">
          <div className="p-2 border-b border-border flex items-center bg-popover">
            <input
              autoFocus
              className="w-full text-sm border border-input bg-background rounded px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {filteredOptions.map((opt) => (
              <li
                key={opt.value}
                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                  opt.value === value ? 'bg-accent/40 font-medium' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents focus loss and click-outside conflict
                  e.stopPropagation();
                  onValueChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </li>
            ))}
            {filteredOptions.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground text-center">
                No options found
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
