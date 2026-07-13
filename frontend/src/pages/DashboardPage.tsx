import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listJobs, getLLMStatus, type Job, type LLMStatus } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import styles from './Pages.module.css';

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);

  useEffect(() => {
    listJobs()
      .then(res => setJobs(res.data.jobs))
      .catch(() => setError('Failed to load jobs'))
      .finally(() => setLoading(false));
    getLLMStatus()
      .then(res => setLlmStatus(res.data))
      .catch(() => {});
  }, []);

  const stats = {
    total: jobs.length,
    complete: jobs.filter(j => j.status === 'GEN_COMPLETE' || j.status === 'RE_COMPLETE').length,
    inProgress: jobs.filter(j => j.status.includes('IN_PROGRESS')).length,
    failed: jobs.filter(j => j.status.includes('FAILED')).length,
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSubtitle}>IBM Middleware Modernization Accelerator — Track and manage migration jobs</p>
        </div>
        <Link to="/jobs/new"><Button>+ New Modernization Job</Button></Link>
      </div>

      {llmStatus && (
        <div className={llmStatus.configured ? styles.llmBannerOk : styles.llmBannerWarn}>
          <span className={styles.llmBannerDot}>{llmStatus.configured ? '●' : '●'}</span>
          <span><strong>AI Engine ({llmStatus.provider}):</strong> {llmStatus.message}</span>
        </div>
      )}

      <div className={styles.statsGrid}>
        {[
          { label: 'Total Jobs', value: stats.total, color: '#0f62fe' },
          { label: 'Complete', value: stats.complete, color: '#198038' },
          { label: 'In Progress', value: stats.inProgress, color: '#f1a10d' },
          { label: 'Failed', value: stats.failed, color: '#da1e28' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statValue} style={{ color: s.color }}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <Card title="Recent Jobs">
        {loading && <p className={styles.muted}>Loading jobs...</p>}
        {error && <p className={styles.error}>{error}</p>}
        {!loading && !error && jobs.length === 0 && (
          <div className={styles.empty}>
            <p>No modernization jobs yet.</p>
            <Link to="/jobs/new"><Button variant="secondary" size="sm">Create your first job</Button></Link>
          </div>
        )}
        {!loading && jobs.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th><th>Platform</th><th>Complexity</th><th>Status</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 10).map(job => (
                <tr key={job.id}>
                  <td className={styles.bold}>{job.name}</td>
                  <td><span className={styles.chip}>{job.sourcePlatform}</span></td>
                  <td>{job.complexity}</td>
                  <td><StatusBadge status={job.status} /></td>
                  <td className={styles.muted}>{new Date(job.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/jobs/${job.id}/upload`}><Button variant="ghost" size="sm">Open</Button></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
