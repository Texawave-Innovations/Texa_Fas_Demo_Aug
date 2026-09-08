import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { FasDocumentItem } from '../documentTypes';

export type PdfBlobGenerator = (item: FasDocumentItem) => Promise<Blob>;

export async function exportDocumentsToZip(
  items: FasDocumentItem[],
  monthLabel: string,
  generateBlob: PdfBlobGenerator,
  onProgress?: (current: number, total: number, name: string) => void
): Promise<void> {
  const zip = new JSZip();

  // Root folder
  const rootName = `FAS_Document_Export_${monthLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const root = zip.folder(rootName) || zip;

  // Module folders
  const folderMap: Record<string, any> = {
    sales: root.folder('Sales'),
    hr: root.folder('HR_and_Payroll'),
    inventory_dispatch: root.folder('Inventory_and_Dispatch'),
    quality_production: root.folder('Quality_and_Production'),
  };

  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const folder = folderMap[item.moduleId] || root;
    const subFolder = folder.folder(item.subTabId.toUpperCase()) || folder;

    if (onProgress) {
      onProgress(i + 1, total, item.code || item.title);
    }

    const safeCode = (item.code || item.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const pdfBlob = await generateBlob(item);
    subFolder.file(`${safeCode}.pdf`, pdfBlob);

    // Yield back to main thread briefly for UI reactivity
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Generate binary zip
  const blob = await zip.generateAsync({ type: 'blob' });
  const archiveFileName = `FAS_Export_${monthLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
  saveAs(blob, archiveFileName);
}


