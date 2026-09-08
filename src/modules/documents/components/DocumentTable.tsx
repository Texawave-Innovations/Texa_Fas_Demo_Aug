// src/modules/documents/components/DocumentTable.tsx
import React from 'react';
import {
  FileText,
  Eye,
  Download,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FasDocumentItem, SelectedItemMap } from '../documentTypes';

interface DocumentTableProps {
  documents: FasDocumentItem[];
  selectedItems: SelectedItemMap;
  onToggleItem: (item: FasDocumentItem) => void;
  onPreview: (item: FasDocumentItem) => void;
}

export const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  selectedItems,
  onToggleItem,
  onPreview,
}) => {
  if (documents.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border/70 p-12 text-center shadow-sm">
        <AlertCircle className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-foreground">No documents found</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          No records match the current month and search filters. Try selecting "All Months" or clearing your query.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/70 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          {/* Table Header */}
          <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground font-bold tracking-wider uppercase text-[10px]">
            <tr>
              <th className="w-10 px-4 py-3.5 text-center">#</th>
              <th className="px-4 py-3.5">DOCUMENT / CODE #</th>
              <th className="px-4 py-3.5">CUSTOMER / PARTY / TITLE</th>
              <th className="px-4 py-3.5">DATE / MONTH</th>
              <th className="px-4 py-3.5 text-right">NET PAYABLE / GROSS (₹)</th>
              <th className="px-4 py-3.5 text-center">STATUS / ROLE / CATEGORY</th>
              <th className="px-4 py-3.5 text-right">ACTIONS</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border/60">
            {documents.map((doc) => {
              const isSelected = !!selectedItems[doc.id];

              return (
                <tr
                  key={doc.id}
                  className={`hover:bg-muted/30 transition-colors ${
                    isSelected ? 'bg-primary/5' : ''
                  }`}
                >
                  {/* Checkbox column */}
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => onToggleItem(doc)}
                      className="cursor-pointer select-none"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-muted-foreground/70" />
                      )}
                    </button>
                  </td>

                  {/* Document code with file icon */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span>{doc.code}</span>
                    </div>
                  </td>

                  {/* Customer / Party */}
                  <td className="px-4 py-3.5">
                    <div className="max-w-xs">
                      <p className="font-semibold text-foreground truncate">{doc.party}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{doc.title}</p>
                    </div>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3.5 whitespace-nowrap text-muted-foreground font-medium">
                    {doc.date}
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-3.5 text-right whitespace-nowrap font-semibold text-foreground">
                    {doc.amount !== undefined
                      ? `₹${Number(doc.amount).toLocaleString('en-IN')}`
                      : '—'}
                  </td>

                  {/* Status Badge */}
                  <td className="px-4 py-3.5 text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        doc.status === 'Approved' || doc.status === 'Paid' || doc.status === 'Completed'
                          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300'
                          : 'bg-muted text-muted-foreground border-border/80'
                      }`}
                    >
                      {doc.status}
                    </span>
                  </td>

                  {/* Actions: Preview & Download */}
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onPreview(doc)}
                        className="h-7 w-7 text-muted-foreground hover:text-primary rounded-lg"
                        title="Preview Document"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onPreview(doc)}
                        className="h-7 w-7 text-muted-foreground hover:text-green-600 rounded-lg"
                        title="View & Download PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

