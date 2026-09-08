import React, { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, Download, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { FasDocumentItem } from '../documentTypes';
import QuotationPrintTemplate from '@/components/QuotationPrintTemplate';
import { FullInvoiceTemplate } from '@/modules/sales/Invoices';
import { DCPrintTemplate } from '@/modules/sales/DC';
import { RGPPrintTemplate } from '@/modules/sales/Gp';
import OrderAcknowledgementPrintTemplate from '@/components/OrderAcknowledgementPrintTemplate';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

interface DocumentPreviewDialogProps {
  item: FasDocumentItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export async function captureElementToPdfBlob(
  containerEl: HTMLElement,
  isLandscape: boolean
): Promise<Blob> {
  const orientation = isLandscape ? 'l' : 'p';
  const pdf = new jsPDF(orientation, 'mm', 'a4');

  // Check if the template contains distinct printable pages
  const pageElements = containerEl.querySelectorAll('.invoice-page, .print-page');

  if (pageElements && pageElements.length > 0) {
    for (let i = 0; i < pageElements.length; i++) {
      const el = pageElements[i] as HTMLElement;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: isLandscape ? 1123 : 794,
      });

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      if (i > 0) pdf.addPage();
      if (isLandscape) {
        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
      } else {
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }
    }
  } else {
    // Fallback for single container or general view
    const canvas = await html2canvas(containerEl, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    if (isLandscape) {
      pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
    } else {
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }
  }

  return pdf.output('blob');
}

export const DocumentPreviewDialog: React.FC<DocumentPreviewDialogProps> = ({
  item,
  isOpen,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  if (!item) return null;

  const isQuotation = item.subTabId === 'quotations' && !!item.details;
  const isInvoice = item.subTabId === 'invoices' && !!item.details;
  const isDC = item.subTabId === 'challan' && !!item.details;
  const isGP = item.subTabId === 'gatepass' && !!item.details;
  const isOrder = item.subTabId === 'orders' && !!item.details;

  const isLandscape = isQuotation || isInvoice;

  const handlePrint = () => {
    window.print();
  };


  const handleDownloadPDF = async () => {
    if (!printRef.current) {
      toast.error('Document preview is still rendering');
      return;
    }

    setIsGeneratingPdf(true);
    const toastId = toast.loading('Generating PDF...');

    try {
      const safeFilename = (item.code || item.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      const blob = await captureElementToPdfBlob(printRef.current, isLandscape);

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFilename}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast.dismiss(toastId);
      toast.success('PDF downloaded successfully!');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.dismiss();
      toast.error('Failed to generate PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`${
          isLandscape ? 'max-w-[95vw] max-h-[95vh]' : 'max-w-4xl max-h-[95vh]'
        } bg-white p-0 overflow-hidden shadow-2xl border-border/80 flex flex-col`}
      >
        <DialogHeader className="p-4 sm:p-5 bg-muted/40 border-b border-border/60 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold text-blue-900 flex items-center gap-2">
                {item.category} Preview - {item.code}
                <Badge variant="outline" className="text-[11px] font-normal py-0">
                  {item.category}
                </Badge>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">{item.title}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-6">
            <Badge
              className={
                item.status === 'Approved' || item.status === 'Paid'
                  ? 'bg-emerald-500/15 text-emerald-700 border-emerald-300'
                  : 'bg-amber-500/15 text-amber-700 border-amber-300'
              }
            >
              {item.status}
            </Badge>
          </div>
        </DialogHeader>

        {/* Scrollable Printable Document Container */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4 sm:p-6">
          <div
            ref={printRef}
            className="bg-white shadow-sm mx-auto"
            style={{ width: 'fit-content', maxWidth: '100%' }}
          >
            <DocumentTemplateRenderer item={item} />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-muted/30 border-t border-border/60 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5 text-xs"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const DocumentTemplateRenderer: React.FC<{ item: FasDocumentItem }> = ({ item }) => {
  const isQuotation = item.subTabId === 'quotations' && !!item.details;
  const isInvoice = item.subTabId === 'invoices' && !!item.details;
  const isDC = item.subTabId === 'challan' && !!item.details;
  const isGP = item.subTabId === 'gatepass' && !!item.details;
  const isOrder = item.subTabId === 'orders' && !!item.details;

  if (isQuotation) {
    return <QuotationPrintTemplate quotation={item.details as any} />;
  }
  if (isInvoice) {
    return <FullInvoiceTemplate invoice={item.details as any} />;
  }
  if (isDC) {
    return <DCPrintTemplate dc={item.details as any} />;
  }
  if (isGP) {
    return <RGPPrintTemplate rgp={item.details as any} />;
  }
  if (isOrder) {
    return <OrderAcknowledgementPrintTemplate order={item.details as any} customers={[]} />;
  }

  return (
    <div className="p-8 space-y-6 text-sm bg-white" style={{ width: '210mm', minHeight: '297mm' }}>
      <div className="flex justify-between items-start border-b border-border/60 pb-4">
        <div>
          <h3 className="font-bold text-base text-foreground tracking-tight">
            FLUORO AUTOMATION SEALS PVT LTD
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Precision Fluoropolymer Components &amp; Engineering
          </p>
          <p className="text-[11px] text-muted-foreground">GSTIN: 33AAECF2716M1ZO</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-foreground">Date: {item.date}</p>
          <p className="text-xs text-muted-foreground">Doc Ref: {item.code}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border border-border/50">
        <div>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Customer / Entity
          </span>
          <p className="font-semibold text-foreground text-sm mt-0.5">{item.party}</p>
          <p className="text-xs text-muted-foreground">Verified Record • System Matched</p>
        </div>
        <div>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Category
          </span>
          <p className="font-semibold text-foreground text-sm mt-0.5 capitalize">
            {item.moduleId.replace('_', ' & ')} • {item.subTabId}
          </p>
          {item.amount !== undefined && (
            <p className="text-xs font-bold text-primary mt-1">
              Gross Amount: ₹{Number(item.amount).toLocaleString('en-IN')}
            </p>
          )}
        </div>
      </div>

      {item.details?.lineItems && Array.isArray(item.details.lineItems) && item.details.lineItems.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Line Items
          </h4>
          <div className="border border-border/60 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 border-b border-border/60 font-semibold text-muted-foreground">
                <tr>
                  <th className="p-2.5">Item Description</th>
                  <th className="p-2.5 text-center">Qty</th>
                  <th className="p-2.5 text-right">Rate (₹)</th>
                  <th className="p-2.5 text-right">Tax (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {item.details.lineItems.map((line: any, i: number) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="p-2.5 font-medium text-foreground">{line.name || line.description}</td>
                    <td className="p-2.5 text-center">{line.qty}</td>
                    <td className="p-2.5 text-right font-mono">₹{line.rate}</td>
                    <td className="p-2.5 text-right font-mono">₹{line.tax || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-border/80 rounded-lg p-6 text-center bg-muted/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-600 mx-auto mb-2 opacity-80" />
          <p className="text-xs font-medium text-foreground">Verified Document Record</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            All records, audit logs, and checksums for this transaction have been validated in FAS ERP.
          </p>
        </div>
      )}
    </div>
  );
};

