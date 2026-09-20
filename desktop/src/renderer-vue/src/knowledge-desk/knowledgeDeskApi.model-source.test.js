/* global describe, expect, it */

import { deleteModelSource, inferModelSourceProviderType } from './knowledgeDeskApi';

describe('inferModelSourceProviderType', () => {
  it('keeps loopback endpoints local-compatible', () => {
    expect(inferModelSourceProviderType('http://127.0.0.1:11434/v1')).toBe('local_compatible');
    expect(inferModelSourceProviderType('http://[::1]:11434/v1')).toBe('local_compatible');
    expect(inferModelSourceProviderType('http://localhost:11434/v1')).toBe('local_compatible');
  });

  it('maps cloud presets to their cloud provider types', () => {
    expect(inferModelSourceProviderType('https://api.deepseek.com/v1')).toBe('deepseek');
    expect(inferModelSourceProviderType('https://api.openai.com/v1')).toBe('openai');
    expect(inferModelSourceProviderType('https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(inferModelSourceProviderType('https://api.anthropic.com')).toBe('anthropic');
  });

  it('defaults unknown remote endpoints to cloud OpenAI-compatible', () => {
    expect(inferModelSourceProviderType('https://models.example.com/v1')).toBe('openai');
    expect(inferModelSourceProviderType('not a url')).toBe('openai');
  });
});

describe('deleteModelSource', () => {
  it('uses the authenticated model-source delete route', async () => {
    let requestPayload;
    window.electronAPI = {
      knowledge: {
        request: async (payload) => {
          requestPayload = payload;
          return undefined;
        },
      },
    };

    await deleteModelSource('source-1');

    expect(requestPayload).toEqual({
      path: '/api/v1/model-sources/source-1',
      method: 'DELETE',
    });
    delete window.electronAPI;
  });
});
