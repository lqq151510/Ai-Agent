import { Provider } from './types';

export function defaultModel(provider: Provider): string {
  return provider === 'OPENAI' ? 'qwen/qwen3.5-9b' : 'qwen3.6:latest';
}
