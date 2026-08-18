const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const legacyDevtoolsGuard = /!app\.isPackaged\s*&&\s*process\.env\.AI_AGENT_ENABLE_LEGACY_DEVTOOLS\s*===\s*['"]1['"]/;

test('packaged builds cannot activate legacy Computer Use IPC through an environment variable', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '../src/main/index.ts'),
    'utf8',
  );
  const ipcRegistrySource = fs.readFileSync(
    path.join(__dirname, '../src/main/ipc-registry.ts'),
    'utf8',
  );

  assert.match(mainSource, legacyDevtoolsGuard);
  assert.match(ipcRegistrySource, legacyDevtoolsGuard);
});

test('packaged bootstrap initializes safe IPC collaborators before applying the legacy gate', () => {
  const mainSource = fs.readFileSync(
    path.join(__dirname, '../src/main/index.ts'),
    'utf8',
  );
  const legacyGuardDeclaration = mainSource.indexOf('const isLegacyEnabled =');
  const firstLegacyGate = mainSource.indexOf('if (isLegacyEnabled && activeWorkspace)');
  const workspaceInitialization = mainSource.indexOf('workspaceManager = new WorkspaceManager()');
  const toolBridgeInitialization = mainSource.indexOf('toolBridge = new ToolExecutionBridge(');

  assert.ok(legacyGuardDeclaration > -1, 'expected an explicit packaged-runtime guard');
  assert.ok(workspaceInitialization > -1 && workspaceInitialization < firstLegacyGate);
  assert.ok(toolBridgeInitialization > -1 && toolBridgeInitialization < firstLegacyGate);
});

test('ingestion job history is exposed through an exact read-only Knowledge IPC route', () => {
  const ipcRegistrySource = fs.readFileSync(
    path.join(__dirname, '../src/main/ipc-registry.ts'),
    'utf8',
  );

  assert.match(
    ipcRegistrySource,
    /if \(pathname === '\/api\/v1\/ingestion-jobs'\) \{\s*\/\/[^\n]*\s*return method === 'GET';\s*\}/,
  );
  assert.doesNotMatch(
    ipcRegistrySource,
    /pathname\.startsWith\('\/api\/v1\/ingestion-jobs\//,
  );
});

test('review bridge exposes only its three exact API routes', () => {
  const ipcRegistrySource = fs.readFileSync(
    path.join(__dirname, '../src/main/ipc-registry.ts'),
    'utf8',
  );

  assert.match(
    ipcRegistrySource,
    /pathname === '\/api\/v1\/knowledge-reviews\/queue'\s*\|\|\s*pathname === '\/api\/v1\/knowledge-reviews\/summary'/,
  );
  assert.match(
    ipcRegistrySource,
    /\^\\\/api\\\/v1\\\/knowledge-reviews\\\/\[0-9a-f-\]\{36\}\\\/complete\$\/i/,
  );
  assert.doesNotMatch(
    ipcRegistrySource,
    /allowedPrefixes\s*=\s*\[[\s\S]*?knowledge-reviews/,
  );
});

test('main-process ingestion job bridge removes snapshots before renderer delivery', () => {
  const ipcRegistryPath = path.join(__dirname, '../src/main/ipc-registry.ts');
  const ipcRegistrySource = fs.readFileSync(ipcRegistryPath, 'utf8');
  const compiled = ts.transpileModule(ipcRegistrySource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: () => ({}),
  });

  const redact = module.exports.redactIngestionJobSnapshots;
  assert.equal(typeof redact, 'function');

  const backendResponse = [
    {
      id: 'job-1',
      status: 'succeeded',
      inputSnapshot: '{"rawContent":"private"}',
      resultSnapshot: '{"summary":"private"}',
      details: {
        inputSnapshot: 'nested-private',
        kept: 'visible',
      },
    },
    {
      id: 'job-2',
      status: 'failed',
      events: [
        { resultSnapshot: 'array-private', message: 'retry' },
        { nested: { inputSnapshot: 'deep-private', attempt: 2 } },
      ],
    },
  ];

  const rendererResponse = JSON.parse(JSON.stringify(redact(backendResponse)));
  assert.deepEqual(rendererResponse, [
    {
      id: 'job-1',
      status: 'succeeded',
      details: { kept: 'visible' },
    },
    {
      id: 'job-2',
      status: 'failed',
      events: [{ message: 'retry' }, { nested: { attempt: 2 } }],
    },
  ]);
  assert.equal(backendResponse[0].inputSnapshot, '{"rawContent":"private"}');
  assert.match(
    ipcRegistrySource,
    /if \(method === 'GET' && normalizedPath === '\/api\/v1\/ingestion-jobs'\) \{\s*return redactIngestionJobSnapshots\(response\);\s*\}\s*return response;/,
  );
});

test('local batch import redacts filesystem errors before they reach the renderer', () => {
  const ipcRegistryPath = path.join(__dirname, '../src/main/ipc-registry.ts');
  const ipcRegistrySource = fs.readFileSync(ipcRegistryPath, 'utf8');
  const compiled = ts.transpileModule(ipcRegistrySource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: () => ({}),
  });

  const safeReason = module.exports.toSafeLocalKnowledgeImportReason;
  assert.equal(typeof safeReason, 'function');
  assert.equal(
    safeReason(new Error("ENOENT: no such file or directory, open '/tmp/private-notes.md'")),
    '文件导入失败，请重新预检后重试。',
  );
  assert.equal(
    safeReason(new Error('Uploaded file could not be parsed')),
    'Uploaded file could not be parsed',
  );
  assert.match(ipcRegistrySource, /reason: toSafeLocalKnowledgeImportReason\(error\)/);
  assert.match(ipcRegistrySource, /throw new Error\('无法读取文件，请检查访问权限后重试。'\)/);
});

test('preflighted local files deleted before commit return a path-free failure result', async () => {
  const ipcRegistryPath = path.join(__dirname, '../src/main/ipc-registry.ts');
  const compiled = ts.transpileModule(fs.readFileSync(ipcRegistryPath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    Buffer,
    require: (moduleName) => {
      if (moduleName === 'fs') return fs;
      if (moduleName === 'path') return path;
      if (moduleName === 'crypto') return require('node:crypto');
      return {};
    },
  });

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-batch-boundary-'));
  const filePath = path.join(tempDirectory, 'to-delete.md');
  fs.writeFileSync(filePath, '# private local note');
  try {
    const registry = Object.create(module.exports.IpcRegistry.prototype);
    registry.localKnowledgeImportBatches = new Map();
    registry.selectKnowledgeFiles = async () => [filePath];
    registry.backendRequest = async () => ({ existingContentHashes: [] });

    const preflight = await registry.preflightLocalKnowledgeImportBatch(42);
    const candidate = preflight.candidates[0];
    fs.unlinkSync(filePath);

    const result = await registry.commitLocalKnowledgeImportBatch(42, {
      batchId: preflight.batchId,
      candidateIds: [candidate.candidateId],
    });
    const serializableResult = JSON.parse(JSON.stringify(result));
    assert.deepEqual(serializableResult, {
      imported: [],
      skipped: [],
      failed: [{
        candidateId: candidate.candidateId,
        name: 'to-delete.md',
        reason: '文件在预检后无法读取，请重新选择文件。',
      }],
    });
    assert.doesNotMatch(JSON.stringify(serializableResult), new RegExp(tempDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.rmdirSync(tempDirectory);
  }
});

test('local batch import keeps file paths and content hashes in the main process', () => {
  const ipcRegistrySource = fs.readFileSync(
    path.join(__dirname, '../src/main/ipc-registry.ts'),
    'utf8',
  );
  const preloadSource = fs.readFileSync(
    path.join(__dirname, '../src/preload/index.ts'),
    'utf8',
  );

  assert.match(ipcRegistrySource, /MAX_KNOWLEDGE_IMPORT_BATCH_FILES\s*=\s*20/);
  assert.match(ipcRegistrySource, /MAX_KNOWLEDGE_IMPORT_FILE_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/);
  assert.match(ipcRegistrySource, /properties:\s*\['openFile',\s*'multiSelections'\]/);
  assert.match(ipcRegistrySource, /this\.assertKnowledgeSender\(event\.sender\);\s*return this\.preflightLocalKnowledgeImportBatch\(event\.sender\.id\)/);
  assert.match(ipcRegistrySource, /batch\.senderId !== senderId \|\| batch\.expiresAt <= Date\.now\(\)/);
  assert.match(ipcRegistrySource, /\/\/ A batch token is intentionally one-time use[\s\S]*?this\.localKnowledgeImportBatches\.delete\(batchId\);/);
  assert.match(ipcRegistrySource, /await this\.readVerifiedLocalKnowledgeImportFile\(candidate\)/);
  assert.match(ipcRegistrySource, /fs\.promises\.open\(filePath, 'r'\)/);
  assert.match(ipcRegistrySource, /Buffer\.allocUnsafe\(before\.size\)/);
  assert.match(ipcRegistrySource, /offset !== before\.size \|\| after\.size !== before\.size/);
  assert.match(ipcRegistrySource, /createHash\('sha256'\)/);
  assert.match(preloadSource, /preflightLocalFileBatch:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('knowledge:preflight-local-file-batch'\)/);
  assert.match(preloadSource, /commitLocalFileBatch:\s*\(payload: \{ batchId: string; candidateIds: string\[\] \}\)/);
  assert.doesNotMatch(preloadSource, /filePath|contentHash/);
});

test('local import accepts only modern Office document extensions and preserves their MIME types', () => {
  const ipcRegistryPath = path.join(__dirname, '../src/main/ipc-registry.ts');
  const compiled = ts.transpileModule(fs.readFileSync(ipcRegistryPath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (moduleName) => {
      if (moduleName === 'path') return path;
      return {};
    },
  });

  const registry = Object.create(module.exports.IpcRegistry.prototype);
  assert.equal(registry.isSupportedKnowledgeFile('/private/notes.docx'), true);
  assert.equal(registry.isSupportedKnowledgeFile('/private/slides.pptx'), true);
  assert.equal(registry.isSupportedKnowledgeFile('/private/legacy.doc'), false);
  assert.equal(registry.isSupportedKnowledgeFile('/private/legacy.ppt'), false);
  assert.equal(
    registry.mimeTypeForKnowledgeFile('/private/notes.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  assert.equal(
    registry.mimeTypeForKnowledgeFile('/private/slides.pptx'),
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  );
});
