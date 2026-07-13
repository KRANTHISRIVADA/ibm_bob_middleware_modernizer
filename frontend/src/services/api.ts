import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export interface Job {
  id: string;
  name: string;
  sourcePlatform: 'APIC' | 'DATAPOWER' | 'IIB_ACE';
  complexity: 'SIMPLE' | 'INTERMEDIATE' | 'COMPLEX';
  description?: string;
  status: string;
  uploadedFile?: string;
  targetStack?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobPayload {
  name: string;
  sourcePlatform: 'APIC' | 'DATAPOWER' | 'IIB_ACE';
  complexity: 'SIMPLE' | 'INTERMEDIATE' | 'COMPLEX';
  description?: string;
}

export interface ArtifactFile {
  name: string;
  size: number;
  url: string;
}

export const createJob = (payload: CreateJobPayload) =>
  api.post<Job & { jobId: string }>('/jobs', payload);

export const listJobs = () =>
  api.get<{ jobs: Job[] }>('/jobs');

export const getJob = (jobId: string) =>
  api.get<Job>(`/jobs/${jobId}`);

export const getJobStatus = (jobId: string) =>
  api.get<{ jobId: string; status: string; updatedAt: string; error: string | null }>(`/jobs/${jobId}/status`);

export const uploadFile = (jobId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/jobs/${jobId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const triggerReverseEngineer = (jobId: string) =>
  api.post(`/jobs/${jobId}/reverse-engineer`);

export const listReverseArtifacts = (jobId: string) =>
  api.get<{ artifacts: ArtifactFile[] }>(`/jobs/${jobId}/reverse-artifacts`);

export const triggerGenerate = (jobId: string, targetStack: string) =>
  api.post(`/jobs/${jobId}/generate`, { targetStack });

export const downloadReverseArtifactsUrl = (jobId: string) =>
  `/api/jobs/${jobId}/reverse-artifacts/download`;

export const downloadGeneratedUrl = (jobId: string) =>
  `/api/jobs/${jobId}/generated/download`;

export interface LLMStatus {
  provider: string;
  configured: boolean;
  message: string;
}

export const getLLMStatus = () =>
  api.get<LLMStatus>('/llm/status');
