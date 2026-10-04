import { isSafari } from '@/core/utils/browser';
import type { TranslationKey } from '@/utils/translations';

import type { ExportFormat, ExportResult } from '../types/export';
import { showExportToast } from './ExportToast';

export function reportFinishedExport(
  result: Pick<ExportResult, 'omittedImageCount'>,
  format: ExportFormat,
  t: (key: TranslationKey) => string,
): void {
  if (format === 'pdf' && isSafari()) {
    showExportToast(t('export_toast_safari_pdf_ready'), { autoDismissMs: 5000 });
  }
  const omitted = result.omittedImageCount ?? 0;
  if (omitted <= 0) return;
  showExportToast(t('export_toast_images_omitted').replace('{count}', String(omitted)), {
    autoDismissMs: 8000,
  });
}
