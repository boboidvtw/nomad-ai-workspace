import { afterEach, describe, expect, it } from 'vitest';

import { ExportFormat } from '../../types/export';
import { reportFinishedExport } from '../exportResultNotice';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('reportFinishedExport', () => {
  it('tells the user how many images stayed as links', () => {
    reportFinishedExport({ omittedImageCount: 3 }, ExportFormat.MARKDOWN, (key) =>
      key === 'export_toast_images_omitted' ? '{count} images stayed as links' : key,
    );

    expect(document.querySelector('.gv-export-toast')?.textContent).toBe(
      '3 images stayed as links',
    );
  });
});
