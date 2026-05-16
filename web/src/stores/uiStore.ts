import { create } from 'zustand';
import type { ModelOption, ReleaseReportResponse, ToolStatsResponse } from '../types';
import { defaultModel } from '../utils';

type ToolStatsScope = 'session' | 'global';

interface UiState {
  effectsEnabled: boolean;
  modelOptions: ModelOption[];
  toolStats: ToolStatsResponse | null;
  toolStatsLoading: boolean;
  releaseReport: ReleaseReportResponse | null;
  releaseReportLoading: boolean;
  toolStatsWindowHours: number;
  toolStatsScope: ToolStatsScope;
  setEffectsEnabled: (enabled: boolean) => void;
  setModelOptions: (options: ModelOption[]) => void;
  setToolStats: (stats: ToolStatsResponse | null) => void;
  setToolStatsLoading: (loading: boolean) => void;
  setReleaseReport: (report: ReleaseReportResponse | null) => void;
  setReleaseReportLoading: (loading: boolean) => void;
  setToolStatsWindowHours: (hours: number) => void;
  setToolStatsScope: (scope: ToolStatsScope) => void;
  resetUi: () => void;
}

const fallbackModelOptions = (): ModelOption[] => [
  { provider: 'OPENAI', model: defaultModel('OPENAI'), isDefault: true }
];

const initialState = {
  effectsEnabled: true,
  modelOptions: fallbackModelOptions(),
  toolStats: null as ToolStatsResponse | null,
  toolStatsLoading: false,
  releaseReport: null as ReleaseReportResponse | null,
  releaseReportLoading: false,
  toolStatsWindowHours: 24,
  toolStatsScope: 'session' as ToolStatsScope
};

export const useUiStore = create<UiState>(set => ({
  ...initialState,
  setEffectsEnabled: effectsEnabled => set({ effectsEnabled }),
  setModelOptions: modelOptions => set({ modelOptions }),
  setToolStats: toolStats => set({ toolStats }),
  setToolStatsLoading: toolStatsLoading => set({ toolStatsLoading }),
  setReleaseReport: releaseReport => set({ releaseReport }),
  setReleaseReportLoading: releaseReportLoading => set({ releaseReportLoading }),
  setToolStatsWindowHours: toolStatsWindowHours => set({ toolStatsWindowHours }),
  setToolStatsScope: toolStatsScope => set({ toolStatsScope }),
  resetUi: () => set({ ...initialState })
}));
