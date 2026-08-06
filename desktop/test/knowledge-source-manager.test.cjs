const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { KnowledgeSourceManager } = require('../dist/main/main/knowledge-source-manager.js');

async function readWithFileHandle(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const before = await handle.stat();
    const content = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < content.length) {
      const { bytesRead } = await handle.read(content, offset, content.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (offset !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error('source changed');
    }
    return { content, size: before.size, modifiedAtMs: before.mtimeMs };
  } finally {
    await handle?.close();
  }
}

function temporaryRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-source-manager-'));
}

function makeManager(root, options = {}) {
  return new KnowledgeSourceManager({
    dataDirectory: path.join(root, 'user-data', 'data'),
    readSourceFile: readWithFileHandle,
    uploadManagedSource: async () => ({ outcome: 'imported', item: { id: 'item' } }),
    stabilityDelayMs: 0,
    scanIntervalMs: 60 * 60 * 1000,
    ...options,
  });
}

test('picker import keeps a private 0600 original after the user source disappears', async () => {
  const root = temporaryRoot();
  const sourceDirectory = path.join(root, 'picker');
  const sourcePath = path.join(sourceDirectory, 'private-note.md');
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(sourcePath, '# private note');

  const uploads = [];
  const openedPaths = [];
  const revealedPaths = [];
  const manager = makeManager(root, {
    uploadManagedSource: async (request) => {
      uploads.push(request);
      return { outcome: 'imported', item: { id: 'item-1' } };
    },
    openPath: async (assetPath) => {
      openedPaths.push(assetPath);
      return '';
    },
    revealPath: (assetPath) => {
      revealedPaths.push(assetPath);
    },
  });

  try {
    await manager.initialize();
    const source = await readWithFileHandle(sourcePath);
    const imported = await manager.ingestPickerContent({
      filename: 'private-note.md',
      content: source.content,
    });
    fs.unlinkSync(sourcePath);

    assert.equal(imported.outcome, 'imported');
    assert.equal(uploads.length, 1);
    assert.match(uploads[0].sourceAssetId, /^[0-9a-f-]{36}$/i);
    assert.equal(uploads[0].sourceAssetOrigin, 'picker');
    assert.deepEqual(await manager.openManagedSourceAsset(uploads[0].sourceAssetId), { opened: true });
    assert.equal(openedPaths.length, 1);
    assert.equal(fs.statSync(openedPaths[0]).mode & 0o777, 0o600);
    assert.deepEqual(await manager.openManagedSourceAsset(uploads[0].sourceAssetId, true), { opened: true });
    assert.equal(revealedPaths.length, 1);
    fs.unlinkSync(openedPaths[0]);
    assert.deepEqual(await manager.openManagedSourceAsset(uploads[0].sourceAssetId), { opened: false });
    assert.deepEqual(await manager.openManagedSourceAsset(uploads[0].sourceAssetId, true), { opened: false });
    assert.doesNotMatch(JSON.stringify(manager.listManagedSourceFolders()), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('managed sources accept DOCX and PPTX with their real MIME types but reject legacy Office extensions', async () => {
  const root = temporaryRoot();
  const uploads = [];
  const manager = makeManager(root, {
    uploadManagedSource: async (request) => {
      uploads.push(request);
      return { outcome: 'imported', item: { id: `item-${uploads.length}` } };
    },
  });

  try {
    await manager.initialize();
    await manager.ingestPickerContent({ filename: 'learning-plan.docx', content: Buffer.from('docx bytes') });
    await manager.ingestPickerContent({ filename: 'architecture.pptx', content: Buffer.from('pptx bytes') });

    assert.deepEqual(
      uploads.map(({ filename, mediaType }) => ({ filename, mediaType })),
      [
        {
          filename: 'learning-plan.docx',
          mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        {
          filename: 'architecture.pptx',
          mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      ],
    );
    await assert.rejects(
      () => manager.ingestPickerContent({ filename: 'legacy.doc', content: Buffer.from('legacy bytes') }),
      /DOCX 或 PPTX/,
    );
  } finally {
    manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('watched folders are non-recursive, cursor-deduplicated, and path-free to callers', async () => {
  const root = temporaryRoot();
  const watchDirectory = path.join(root, 'incoming');
  fs.mkdirSync(path.join(watchDirectory, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(watchDirectory, 'first.md'), '# same bytes');
  fs.writeFileSync(path.join(watchDirectory, 'copy.md'), '# same bytes');
  fs.writeFileSync(path.join(watchDirectory, '.hidden.md'), '# hidden');
  fs.writeFileSync(path.join(watchDirectory, 'ignored.exe'), 'ignored');
  fs.writeFileSync(path.join(watchDirectory, 'nested', 'inside.md'), '# non recursive');

  const seenContent = new Set();
  const uploads = [];
  const manager = makeManager(root, {
    uploadManagedSource: async (request) => {
      uploads.push(request);
      const fingerprint = crypto.createHash('sha256').update(request.content).digest('hex');
      if (seenContent.has(fingerprint)) return { outcome: 'skipped' };
      seenContent.add(fingerprint);
      return { outcome: 'imported', item: { id: `item-${uploads.length}` } };
    },
  });

  try {
    await manager.initialize();
    await manager.addManagedSourceFolder(async () => watchDirectory);
    const listed = manager.listManagedSourceFolders();
    assert.equal(listed.folders.length, 1);
    assert.equal(listed.folders[0].label, 'incoming');
    assert.doesNotMatch(JSON.stringify(listed), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(JSON.stringify(listed), /directoryPath|storageFileName|contentHash/i);

    await manager.scanManagedSourceFolder(listed.folders[0].id);
    assert.equal(uploads.length, 2);
    const afterFirstScan = manager.listManagedSourceFolders().folders[0];
    assert.equal(afterFirstScan.counts.imported, 1);
    assert.equal(afterFirstScan.counts.skipped, 1);

    await manager.scanManagedSourceFolder(listed.folders[0].id);
    assert.equal(uploads.length, 2, 'unchanged files must not be re-imported');
    assert.deepEqual(await manager.setManagedSourceFolderEnabled(listed.folders[0].id, false), { updated: true });
    assert.deepEqual(await manager.scanManagedSourceFolder(listed.folders[0].id), { scanned: false });
    assert.deepEqual(await manager.removeManagedSourceFolder(listed.folders[0].id), { removed: true });
    assert.equal(fs.existsSync(watchDirectory), true, 'removing a source must not modify the user folder');
  } finally {
    manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an unstable file waits for a later stable scan instead of importing partial bytes', async () => {
  const root = temporaryRoot();
  const watchDirectory = path.join(root, 'incoming');
  const sourcePath = path.join(watchDirectory, 'writing.md');
  fs.mkdirSync(watchDirectory, { recursive: true });
  fs.writeFileSync(sourcePath, '# partial');

  let uploads = 0;
  const manager = makeManager(root, {
    stabilityDelayMs: 40,
    uploadManagedSource: async () => {
      uploads += 1;
      return { outcome: 'imported', item: { id: 'item' } };
    },
  });

  try {
    await manager.initialize();
    await manager.addManagedSourceFolder(async () => watchDirectory);
    const folderId = manager.listManagedSourceFolders().folders[0].id;
    const scan = manager.scanManagedSourceFolder(folderId);
    await new Promise((resolve) => setTimeout(resolve, 5));
    fs.appendFileSync(sourcePath, ' written later');
    await scan;
    assert.equal(uploads, 0);

    await manager.scanManagedSourceFolder(folderId);
    assert.equal(uploads, 1);
  } finally {
    manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending managed originals recover across restart without exposing storage details', async () => {
  const root = temporaryRoot();
  const sourceContent = Buffer.from('# recover me');
  let assetId;
  const firstManager = makeManager(root, {
    uploadManagedSource: async (request) => {
      assetId = request.sourceAssetId;
      throw new Error('backend is temporarily unavailable');
    },
  });

  try {
    await firstManager.initialize();
    await assert.rejects(
      () => firstManager.ingestPickerContent({ filename: 'recover.md', content: sourceContent }),
      /资料导入失败，请稍后重试。/,
    );
    firstManager.dispose();

    const openedPaths = [];
    const secondManager = makeManager(root, {
      uploadManagedSource: async (request) => {
        assert.equal(request.sourceAssetId, assetId);
        return { outcome: 'imported', item: { id: 'recovered' } };
      },
      openPath: async (assetPath) => {
        openedPaths.push(assetPath);
        return '';
      },
    });
    try {
      await secondManager.initialize();
      const result = await secondManager.openManagedSourceAsset(assetId);
      assert.deepEqual(result, { opened: true });
      assert.equal(openedPaths.length, 1);
      assert.doesNotMatch(JSON.stringify(result), /storage|path|hash/i);
    } finally {
      secondManager.dispose();
    }
  } finally {
    firstManager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
