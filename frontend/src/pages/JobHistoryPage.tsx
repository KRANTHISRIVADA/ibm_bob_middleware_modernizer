import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listJobs, type Job } from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import styles from './Pages.module.css';

export default function JobHistoryPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    listJobs().then(res => setJobs(res.data.jobs)).finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter(j =>
    j.name.toLowerCase().includes(search.toLowerCase()) ||
    j.sourcePlatform.toLowerCase().includes(search.toLowerCase()) ||
    j.status.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Job History & Audit Trail</h1>
          <p className={styles.pageSubtitle}>All modernization jobs — {jobs.length} total</p>
        </div>
        <Link to="/jobs/new"><Button>+ New Job</Button></Link>
      </div>

      <Card>
        <input
          className={styles.input}
          placeholder="Search by name, platform, or status..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {loading && <p className={styles.muted}>Loading...</p>}
        {!loading && filtered.length === 0 && <p className={styles.muted}>No jobs found.</p>}

        {filtered.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Platform</th>
                <th>Complexity</th>
                <th>Target Stack</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(job => (
                <tr key={job.id}>
                  <td className={styles.bold}>{job.name}</td>
                  <td><span className={styles.chip}>{job.sourcePlatform}</span></td>
                  <td>{job.complexity}</td>
                  <td>{job.targetStack || '—'}</td>
                  <td><StatusBadge status={job.status} /></td>
                  <td className={styles.muted}>{new Date(job.createdAt).toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Link to={`/jobs/${job.id}/artifacts`}><Button variant="ghost" size="sm">Artifacts</Button></Link>
                      <Link to={`/jobs/${job.id}/download`}><Button variant="ghost" size="sm">Download</Button></Link>
                    </div>
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
