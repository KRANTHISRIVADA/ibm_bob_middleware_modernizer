import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/common/Layout';
import DashboardPage from './pages/DashboardPage';
import NewJobPage from './pages/NewJobPage';
import UploadPage from './pages/UploadPage';
import ReverseEngineerPage from './pages/ReverseEngineerPage';
import ArtifactViewerPage from './pages/ArtifactViewerPage';
import GeneratePage from './pages/GeneratePage';
import DownloadPage from './pages/DownloadPage';
import JobHistoryPage from './pages/JobHistoryPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="jobs/new" element={<NewJobPage />} />
          <Route path="jobs/:jobId/upload" element={<UploadPage />} />
          <Route path="jobs/:jobId/reverse" element={<ReverseEngineerPage />} />
          <Route path="jobs/:jobId/artifacts" element={<ArtifactViewerPage />} />
          <Route path="jobs/:jobId/generate" element={<GeneratePage />} />
          <Route path="jobs/:jobId/download" element={<DownloadPage />} />
          <Route path="history" element={<JobHistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
