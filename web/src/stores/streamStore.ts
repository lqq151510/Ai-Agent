import { create } from 'zustand';

interface StreamState {
  activeId: string | null;
  buffer: string;
  setStream: (id: string, chunk: string) => void;
  resetStream: () => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  activeId: null,
  buffer: '',
  setStream: (id, chunk) => set((state) => ({ 
    activeId: id, 
    buffer: state.activeId === id ? state.buffer + chunk : chunk 
  })),
  resetStream: () => set({ activeId: null, buffer: '' })
}));
