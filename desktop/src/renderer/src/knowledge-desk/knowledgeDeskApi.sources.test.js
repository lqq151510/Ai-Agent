/* global afterEach, describe, expect, it */

import {
  addManagedSourceFolder,
  canUseManagedSourceFolders,
  listManagedSourceFolders,
  loadKnowledgeItemDetail,
  openManagedSourceAsset,
  removeManagedSourceFolder,
  scanManagedSourceFolder,
  setManagedSourceFolderEnabled,
} from './knowledgeDeskApi';

afterEach(() => {
  delete window.electronAPI;
});

describe('managed local source bridge', () => {
  it('maps only safe source asset and folder metadata into the renderer', async () => {
    window.electronAPI = {
      knowledge: {
        request: async () => ({
          id: 'item-1',
          sourceType: 'pdf',
          title: '本机论文',
          sourceUri: 'upload://paper.pdf',
          rawContent: '正文',
          status: 'ready',
          tags: [],
          sourceAsset: {
            id: 'asset-opaque-1',
            originalFilename: 'paper.pdf',
            mediaType: 'application/pdf',
            byteSize: 2048,
            origin: 'watched_folder',
            availability: 'available',
            filePath: '/Users/private/paper.pdf',
            storageKey: 'sources/private',
            contentHash: 'a'.repeat(64),
          },
        }),
        listManagedSourceFolders: async () => ({
          folders: [{
            id: 'folder-opaque-1',
            label: '研究资料',
            enabled: true,
            status: 'watching',
            lastScanAt: '2026-07-30T08:00:00.000Z',
            counts: { waiting: 1, importing: 0, imported: 3, skipped: 2, failed: 0 },
            path: '/Users/private/research',
            cursor: '/Users/private/research/paper.pdf',
          }],
        }),
        addManagedSourceFolder: async () => ({}),
        setManagedSourceFolderEnabled: async () => ({}),
        scanManagedSourceFolder: async () => ({}),
        removeManagedSourceFolder: async () => ({}),
        openManagedSourceAsset: async () => ({ opened: true }),
      },
    };

    const item = await loadKnowledgeItemDetail('item-1');
    const folders = await listManagedSourceFolders();

    expect(item.sourceAsset).toEqual({
      id: 'asset-opaque-1',
      originalFilename: 'paper.pdf',
      mediaType: 'application/pdf',
      byteSize: 2048,
      origin: 'watched_folder',
      availability: 'available',
    });
    expect(folders).toEqual([{
      id: 'folder-opaque-1',
      label: '研究资料',
      enabled: true,
      status: 'watching',
      lastScanAt: '2026-07-30T08:00:00.000Z',
      counts: { waiting: 1, importing: 0, imported: 3, skipped: 2, failed: 0 },
    }]);
    expect(JSON.stringify({ item, folders })).not.toContain('/Users/private');
    expect(JSON.stringify({ item, folders })).not.toContain('contentHash');
    expect(JSON.stringify({ item, folders })).not.toContain('storageKey');
  });

  it('uses only opaque folder and asset identifiers for source actions', async () => {
    const calls = [];
    window.electronAPI = {
      knowledge: {
        listManagedSourceFolders: async () => ({ folders: [] }),
        addManagedSourceFolder: async (payload) => calls.push(['add', payload]),
        setManagedSourceFolderEnabled: async (payload) => calls.push(['enabled', payload]),
        scanManagedSourceFolder: async (payload) => calls.push(['scan', payload]),
        removeManagedSourceFolder: async (payload) => calls.push(['remove', payload]),
        openManagedSourceAsset: async (payload) => calls.push(['open', payload]),
      },
    };

    expect(canUseManagedSourceFolders()).toBe(true);
    await addManagedSourceFolder();
    await setManagedSourceFolderEnabled('folder-opaque-1', false);
    await scanManagedSourceFolder('folder-opaque-1');
    await removeManagedSourceFolder('folder-opaque-1');
    await openManagedSourceAsset('asset-opaque-1', true);

    expect(calls).toEqual([
      ['add', undefined],
      ['enabled', { folderId: 'folder-opaque-1', enabled: false }],
      ['scan', { folderId: 'folder-opaque-1' }],
      ['remove', { folderId: 'folder-opaque-1' }],
      ['open', { assetId: 'asset-opaque-1', reveal: true }],
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/path|hash|storage/i);
  });

  it('normalizes a disabled main-process folder to the renderer paused state', async () => {
    window.electronAPI = {
      knowledge: {
        listManagedSourceFolders: async () => ({
          folders: [{
            id: 'folder-opaque-2',
            label: '已暂停资料',
            enabled: false,
            status: 'disabled',
            counts: {},
            directoryPath: '/private/never-expose',
          }],
        }),
        addManagedSourceFolder: async () => ({}),
        setManagedSourceFolderEnabled: async () => ({}),
        scanManagedSourceFolder: async () => ({}),
        removeManagedSourceFolder: async () => ({}),
        openManagedSourceAsset: async () => ({}),
      },
    };

    await expect(listManagedSourceFolders()).resolves.toEqual([{
      id: 'folder-opaque-2',
      label: '已暂停资料',
      enabled: false,
      status: 'paused',
      lastScanAt: null,
      counts: { waiting: 0, importing: 0, imported: 0, skipped: 0, failed: 0 },
    }]);
  });

  it('does not report success when the main process cannot open a managed original', async () => {
    window.electronAPI = {
      knowledge: {
        listManagedSourceFolders: async () => ({ folders: [] }),
        addManagedSourceFolder: async () => ({}),
        setManagedSourceFolderEnabled: async () => ({}),
        scanManagedSourceFolder: async () => ({}),
        removeManagedSourceFolder: async () => ({}),
        openManagedSourceAsset: async () => ({ opened: false, filePath: '/private/never-expose' }),
      },
    };

    await expect(openManagedSourceAsset('asset-opaque-1')).rejects.toThrow('本机原件目前不可打开');
  });
});
