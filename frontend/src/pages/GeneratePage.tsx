import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { triggerGenerate, getJobStatus } from '../services/api';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import StatusBadge from '../components/common/StatusBadge';
import styles from './Pages.module.css';

const TARGET_STACKS = [
  {
    id: 'JAVA_SPRING_BOOT',
    label: 'Java Spring Boot',
    desc: 'Java 21, Spring Boot 3.x, Maven, JUnit 5, Dockerfile',
    icon: '☕',
  },
  {
    id: 'NODEJS',
    label: 'Node.js / TypeScript',
    desc: 'TypeScript, NestJS/Express, Jest, Dockerfile',
    icon: '⬡',
  },
  {
    id: 'PYTHON_FASTAPI',
    label: 'Python FastAPI',
    desc: 'Python 3.11+, FastAPI, Pydantic, Pytest, Dockerfile',
    icon: '🐍',
  },
] as const;

const POLL_MS = 3000;

export default function GeneratePage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [stack, setStack] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getJobStatus(jobId!).then(res => setStatus(res.data.status));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      const res = await getJobStatus(jobId!);
      setStatus(res.data.status);
      if (['GEN_COMPLETE', 'GEN_FAILED'].includes(res.data.status)) {
        clearInterval(pollRef.current!);
        if (res.data.error) setError(res.data.error);
      }
    }, POLL_MS);
  };

  const generate = async () => {
    if (!stack || loading) return;
    setLoading(true); setError('');
    try {
      await triggerGenerate(jobId!, stack);
      setStatus('GEN_IN_PROGRESS');
      startPolling();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to start generation');
      setLoading(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Code Generation</h1>
          <p className={styles.pageSubtitle}>Job ID: {jobId} — Status: <StatusBadge status={status} /></p>
        </div>
      </div>

      {!['GEN_IN_PROGRESS', 'GEN_COMPLETE'].includes(status) && (
        <Card title="Select Target Technology Stack" accent>
          <div className={styles.optionGrid}>
            {TARGET_STACKS.map(t => (
              <button key={t.id} className={[styles.optionCard, stack === t.id ? styles.selected : ''].join(' ')} onClick={() => setStack(t.id)}>
                <div className={styles.stackIcon}>{t.icon}</div>
                <div className={styles.optionTitle}>{t.label}</div>
                <div className={styles.optionDesc}>{t.desc}</div>
              </button>
            ))}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <Button size="lg" disabled={!stack} loading={loading} onClick={generate} style={{ marginTop: 16 }}>
            Generate Microservice
          </Button>
        </Card>
      )}

      {status === 'GEN_IN_PROGRESS' && (
        <Card title="Generating Code...">
          <div className={styles.stageList}>
            {['Applying reverse engineering specification', 'Generating controllers and routes', 'Generating service and mapper layers', 'Generating Dockerfile and Kubernetes YAML', 'Generating tests and README'].map((s, i) => (
              <div key={s} className={[styles.stageItem, styles.stageActive].join(' ')}>
                <span className={styles.stageDot}>⟳</span> {s}
              </div>
            ))}
          </div>
        </Card>
      )}

      {status === 'GEN_COMPLETE' && (
        <Card accent>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <h2>Code Generation Complete!</h2>
            <p className={styles.muted}>Your production-ready microservice is ready to download.</p>
            <Button size="lg" onClick={() => navigate(`/jobs/${jobId}/download`)}>
              Download Generated Code →
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
