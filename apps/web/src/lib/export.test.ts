import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, downloadExport } from './api';

describe('downloadExport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads the response blob with the requested filename', async () => {
    const click = vi.fn();
    const anchor = { href: '', download: '', click };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('zip')));
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await downloadExport('/web/v1/export', 'shootspot-export.zip');

    expect(fetch).toHaveBeenCalledWith('/web/v1/export', { credentials: 'same-origin' });
    expect(anchor).toMatchObject({ href: 'blob:export', download: 'shootspot-export.zip' });
    expect(click).toHaveBeenCalledOnce();
  });

  it('throws ApiError for a failed export response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(downloadExport('/web/v1/export', 'export.zip')).rejects.toBeInstanceOf(ApiError);
  });
});
