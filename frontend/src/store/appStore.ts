import { create } from 'zustand';
import type { Job } from '../services/api';

interface AppState {
  currentJobId: string | null;
  currentJob: Job | null;
  setCurrentJobId: (id: string | null) => void;
  setCurrentJob: (job: Job | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentJobId: null,
  currentJob: null,
  setCurrentJobId: (id) => set({ currentJobId: id }),
  setCurrentJob: (job) => set({ currentJob: job, currentJobId: job?.id ?? null }),
}));
