import { create } from 'zustand';
import type { ModelOption, ReleaseReportResponse, ToolStatsResponse } from '../types';
import { defaultModel } from '../utils';

type ToolStatsScope = 'session' | 'global';

interface UiState {
  effectsEnabled: boolean;
  modelOptions: ModelOption[];
  contextTokenLimit: number | null;
  toolStats: ToolStatsResponse | null;
  toolStatsLoading: boolean;
  releaseReport: ReleaseReportResponse | null;
  releaseReportLoading: boolean;
  toolStatsWindowHours: number;
  toolStatsScope: ToolStatsScope;
  useLocalAi: boolean;
  setEffectsEnabled: (enabled: boolean) => void;
  setModelOptions: (options: ModelOption[]) => void;
  setContextTokenLimit: (limit: number | null) => void;
  setToolStats: (stats: ToolStatsResponse | null) => void;
  setToolStatsLoading: (loading: boolean) => void;
  setReleaseReport: (report: ReleaseReportResponse | null) => void;
  setReleaseReportLoading: (loading: boolean) => void;
  setToolStatsWindowHours: (hours: number) => void;
  setToolStatsScope: (scope: ToolStatsScope) => void;
  setUseLocalAi: (useLocal: boolean) => void;
  resetUi: () => void;
}

const fallbackModelOptions = (): ModelOption[] => [
  { provider: 'OPENAI', model: defaultModel('OPENAI'), isDefault: true }
];

const initialState = {
  effectsEnabled: true,
  modelOptions: fallbackModelOptions(),
  contextTokenLimit: null as number | null,
  toolStats: null as ToolStatsResponse | null,
  toolStatsLoading: false,
  releaseReport: null as ReleaseReportResponse | null,
  releaseReportLoading: false,
  toolStatsWindowHours: 24,
  toolStatsScope: 'session' as ToolStatsScope,
  useLocalAi: false
};

export const useUiStore = create<UiState>(set => ({
  ...initialState,
  setEffectsEnabled: effectsEnabled => set({ effectsEnabled }),
  setModelOptions: modelOptions => set({ modelOptions }),
  setContextTokenLimit: contextTokenLimit => set({ contextTokenLimit }),
  setToolStats: toolStats => set({ toolStats }),
  setToolStatsLoading: toolStatsLoading => set({ toolStatsLoading }),
  setReleaseReport: releaseReport => set({ releaseReport }),
  setReleaseReportLoading: releaseReportLoading => set({ releaseReportLoading }),
  setToolStatsWindowHours: toolStatsWindowHours => set({ toolStatsWindowHours }),
  setToolStatsScope: toolStatsScope => set({ toolStatsScope }),
  setUseLocalAi: useLocalAi => set({ useLocalAi }),
  resetUi: () => set({ ...initialState })
}));
