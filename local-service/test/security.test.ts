import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

const TOKEN = 'test-token-with-fixed-length';

function fixture(treeMaxNodes = 3) {
  const parent = mkdtempSync(path.join(tmpdir(), 'local-service-'));
  const root = path.join(parent, 'workspace');
  const collision = path.join(parent, 'workspace-secret');
  mkdirSync(path.join(root, 'src', 'deep'), { recursive: true });
  mkdirSync(collision);
  writeFileSync(path.join(root, 'src', 'hello.txt'), 'hello');
  writeFileSync(path.join(root, 'src', 'deep', 'nested.txt'), 'nested');
  writeFileSync(path.join(collision, 'secret.txt'), 'secret');
  symlinkSync(path.join(root, 'src', 'hello.txt'), path.join(root, 'internal-link.txt'));
  symlinkSync(path.join(root, 'src'), path.join(root, 'internal-dir-link'));
  symlinkSync(path.join(collision, 'secret.txt'), path.join(root, 'external-link.txt'));
  return {
    parent,
    root,
    app: createApp(root, TOKEN, { treeMaxDepth: 5, treeMaxNodes }),
  };
}

function auth() {
  return { Authorization: `Bearer ${TOKEN}` };
}

test('file route reads a legal relative path without exposing an absolute path', async (t) => {
  const f = fixture();
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  const response = await request(f.app).get('/file').query({ path: 'src/hello.txt' }).set(auth());
  assert.equal(response.status, 200);
  assert.equal(response.body.path, 'src/hello.txt');
  assert.equal(response.body.content, 'hello');
  assert.equal(JSON.stringify(response.body).includes(f.parent), false);
});

test('file route rejects absolute paths, traversal, prefix collisions and external symlinks', async (t) => {
  const f = fixture();
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  const paths = [
    path.join(f.root, 'src', 'hello.txt'),
    '../workspace-secret/secret.txt',
    'external-link.txt',
    'src/does-not-exist.txt',
    'src/hello.txt\0ignored',
  ];
  for (const candidate of paths) {
    const response = await request(f.app).get('/file').query({ path: candidate }).set(auth());
    assert.ok(response.status >= 400, `${candidate} unexpectedly returned ${response.status}`);
  }
});

test('file route permits an internal symlink and reports its canonical relative path', async (t) => {
  const f = fixture();
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  const response = await request(f.app).get('/file').query({ path: 'internal-link.txt' }).set(auth());
  assert.equal(response.status, 200);
  assert.equal(response.body.path, 'src/hello.txt');
});

test('file route rejects symlink directory components', async (t) => {
  const f = fixture();
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  const response = await request(f.app).get('/file').query({ path: 'internal-dir-link/hello.txt' }).set(auth());
  assert.equal(response.status, 400);
});

test('authentication rejects a wrong token and exec is not mounted', async (t) => {
  const f = fixture();
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  assert.equal((await request(f.app).get('/file').query({ path: 'src/hello.txt' }).set('Authorization', 'Bearer wrong')).status, 401);
  assert.equal((await request(f.app).post('/exec').set(auth()).send({ cmd: 'pwd' })).status, 404);
});

test('malformed JSON bodies return a stable 400 response', async (t) => {
  const f = fixture();
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  const response = await request(f.app)
    .post('/context/files')
    .set(auth())
    .set('Content-Type', 'application/json')
    .send('{"paths":');
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: 'invalid request body' });
});

test('context is fixed to the startup root and files rejects a mixed invalid batch atomically', async (t) => {
  const f = fixture();
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  const context = await request(f.app).get('/context').set(auth());
  assert.equal(context.status, 200);
  assert.equal(context.body.workspacePath, '.');
  assert.equal(JSON.stringify(context.body).includes(f.parent), false);
  assert.equal((await request(f.app).get('/context').query({ path: f.root }).set(auth())).status, 400);

  const files = await request(f.app)
    .post('/context/files')
    .set(auth())
    .send({ paths: ['src/hello.txt', '../workspace-secret/secret.txt'] });
  assert.equal(files.status, 400);
  assert.equal(files.body.files, undefined);
});

test('workspace tree enforces depth and node limits and does not expose external symlinks', async (t) => {
  const f = fixture();
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));
  writeFileSync(path.join(f.root, 'a.txt'), 'a');
  writeFileSync(path.join(f.root, 'b.txt'), 'b');
  writeFileSync(path.join(f.root, 'c.txt'), 'c');

  const response = await request(f.app).get('/workspace/tree').query({ path: '.', depth: 99 }).set(auth());
  assert.equal(response.status, 200);
  assert.equal(response.body.path, '.');
  assert.equal(response.body.truncated, true);

  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes('nested.txt'), false);
  assert.equal(serialized.includes('external-link.txt'), false);
  assert.equal(serialized.includes(f.parent), false);
});

test('workspace tree depth includes the requested directory levels', async (t) => {
  const f = fixture(20);
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  const tree = async (depth: number) => (await request(f.app).get('/workspace/tree').query({ path: '.', depth }).set(auth())).body.tree;
  assert.deepEqual(await tree(0), [
    { name: 'src', path: 'src', type: 'directory', children: [] },
    { name: 'internal-link.txt', path: 'src/hello.txt', type: 'file', size: 5 },
  ]);
  assert.deepEqual(await tree(1), [
    { name: 'src', path: 'src', type: 'directory', children: [
      { name: 'deep', path: 'src/deep', type: 'directory', children: [] },
      { name: 'hello.txt', path: 'src/hello.txt', type: 'file', size: 5 },
    ] },
    { name: 'internal-link.txt', path: 'src/hello.txt', type: 'file', size: 5 },
  ]);
  assert.deepEqual(await tree(2), [
    { name: 'src', path: 'src', type: 'directory', children: [
      { name: 'deep', path: 'src/deep', type: 'directory', children: [
        { name: 'nested.txt', path: 'src/deep/nested.txt', type: 'file', size: 6 },
      ] },
      { name: 'hello.txt', path: 'src/hello.txt', type: 'file', size: 5 },
    ] },
    { name: 'internal-link.txt', path: 'src/hello.txt', type: 'file', size: 5 },
  ]);
});

test('workspace tree does not enter symlink directories', async (t) => {
  const f = fixture(20);
  t.after(() => rmSync(f.parent, { recursive: true, force: true }));

  const response = await request(f.app).get('/workspace/tree').query({ path: '.', depth: 5 }).set(auth());
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(response.body).includes('internal-dir-link'), false);
});
