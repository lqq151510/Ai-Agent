import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { searchKnowledgeItems } from '../knowledgeDeskApi';
import SearchPage from './SearchPage.vue';

vi.mock('../knowledgeDeskApi', async (importOriginal) => ({
  ...await importOriginal(),
  searchKnowledgeItems: vi.fn(),
}));

const item = (id, overrides = {}) => ({
  id, title: `AI note ${id}`, source: 'Local', type: 'markdown', time: '今天',
  summary: 'AI search example', tags: ['AI'], status: 'done', ...overrides,
});
const page = (entry) => ({ items: [entry], total: 1, page: 1, pageSize: 12 });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const settle = async () => {
  await Promise.resolve();
  await nextTick();
};

let app;
let root;

function mount(props = {}) {
  root = document.createElement('div');
  document.body.append(root);
  app = createApp({
    render: () => h(SearchPage, {
      apiEnabled: true, availableTags: [], searchableItems: [], onOpenDetail: vi.fn(), ...props,
    }),
  });
  app.mount(root);
}

async function search(query) {
  const input = root.querySelector('input[aria-label="全局搜索"]');
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  root.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
}

async function clickButton(label) {
  const button = Array.from(root.querySelectorAll('button')).find((candidate) => candidate.textContent.trim() === label);
  expect(button, `button ${label}`).toBeDefined();
  button.click();
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(searchKnowledgeItems).mockReset();
});
afterEach(() => {
  app?.unmount();
  root?.remove();
});

describe('Vue search interaction regression', () => {
  it('keeps the latest results when an earlier request resolves last', async () => {
    const oldRequest = deferred();
    const newRequest = deferred();
    vi.mocked(searchKnowledgeItems)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    mount();
    await search('old');
    await search('new');
    newRequest.resolve(page(item('new')));
    await settle();
    expect(root.querySelector('.kd-search-result').textContent).toContain('AI note new');
    oldRequest.resolve(page(item('old')));
    await settle();
    expect(root.querySelector('.kd-search-result').textContent).toContain('AI note new');
    expect(localStorage.getItem('kd:search-history')).toBe('["new"]');
  });

  it('discards a request invalidated by editing before the next search completes', async () => {
    const oldRequest = deferred();
    const newRequest = deferred();
    vi.mocked(searchKnowledgeItems)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    mount();
    await search('old');
    await search('new');
    oldRequest.resolve(page(item('old')));
    await settle();
    expect(root.querySelector('.kd-search-result')).toBeNull();
    expect(root.querySelector('button[type="submit"]').disabled).toBe(true);
    newRequest.resolve(page(item('new')));
    await settle();
    expect(root.querySelector('.kd-search-result').textContent).toContain('AI note new');
    expect(root.querySelector('button[type="submit"]').disabled).toBe(false);
  });

  it.each(['AI', ''])('paginates local query "%s" and filters items beyond the first ten', async (query) => {
    const items = Array.from({ length: 25 }, (_, index) => item(String(index)));
    items[24] = item('24', { status: 'archived', type: 'pdf', tags: ['AI', 'late'] });
    const onOpenDetail = vi.fn();
    mount({ apiEnabled: false, availableTags: ['AI', 'late'], searchableItems: items, onOpenDetail });
    await search(query);
    expect(root.querySelectorAll('.kd-search-result')).toHaveLength(12);
    expect(root.querySelector('.kd-search-scope').textContent).toContain('25');
    await clickButton('下一页');
    expect(root.querySelectorAll('.kd-search-result')).toHaveLength(12);
    expect(root.querySelector('.kd-search-result').textContent).toContain('AI note 12');
    await clickButton('下一页');
    expect(root.querySelectorAll('.kd-search-result')).toHaveLength(1);
    await clickButton('归档');
    expect(root.querySelectorAll('.kd-search-result')).toHaveLength(1);
    expect(root.querySelector('.kd-search-result').textContent).toContain('AI note 24');
    root.querySelector('.kd-search-result').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ id: '24' }));
    expect(searchKnowledgeItems).not.toHaveBeenCalled();
  });
});
