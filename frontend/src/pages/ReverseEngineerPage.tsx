import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getJobStatus, triggerReverseEngineer } from '../services/api';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import StatusBadge from '../components/common/StatusBadge';
import styles from './Pages.module.css';

const POLL_MS = 3000;

const STAGES = [
  { key: 'parse', label: 'Parsing source artifact' },
  { key: 'extract', label: 'Extracting interface metadata' },
  { key: 'llm', label: 'Invoking AI engine for analysis' },
  { key: 'validate', label: 'Validating extracted artifacts' },
  { key: 'build', label: 'Building reverse engineering documents' },
];

export default function ReverseEngineerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [triggered, setTriggered] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await getJobStatus(jobId!);
        setStatus(res.data.status);
        if (res.data.status === 'RE_COMPLETE' || res.data.status === 'RE_FAILED') {
          clearInterval(pollRef.current!);
          if (res.data.error) setError(res.data.error);
        }
      } catch (_) {}
    }, POLL_MS);
  };

  useEffect(() => {
    getJobStatus(jobId!).then(res => setStatus(res.data.status));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  useEffect(() => {
    if (status === 'RE_IN_PROGRESS') {
      const t = setInterval(() => setActiveStage(s => Math.min(s + 1, STAGES.length - 1)), 4000);
      return () => clearInterval(t);
    }
  }, [status]);

  const trigger = async () => {
    setError(''); setTriggered(true); setActiveStage(0);
    try {
      await triggerReverseEngineer(jobId!);
      setStatus('RE_IN_PROGRESS');
      startPolling();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to start reverse engineering');
      setTriggered(false);
    }
  };

  const canTrigger = ['UPLOADED', 'RE_FAILED'].includes(status);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Reverse Engineering</h1>
          <p className={styles.pageSubtitle}>Job ID: {jobId} — Status: <StatusBadge status={status} /></p>
        </div>
      </div>

      {(status === 'CREATED') && (
        <Card>
          <p className={styles.warning}>⚠ Please upload a source artifact before starting reverse engineering.</p>
          <Button variant="secondary" onClick={() => navigate(`/jobs/${jobId}/upload`)}>Go to Upload</Button>
        </Card>
      )}

      {canTrigger && (
        <Card title="Start Reverse Engineering" accent>
          <p style={{ marginBottom: 16 }}>The AI engine will analyze your uploaded source artifact and generate 14 structured reverse engineering documents.</p>
          <Button size="lg" onClick={trigger} loading={triggered && status !== 'RE_FAILED'}>
            Start Reverse Engineering
          </Button>
        </Card>
      )}

      {status === 'RE_IN_PROGRESS' && (
        <Card title="Processing...">
          <div className={styles.stageList}>
            {STAGES.map((s, i) => (
              <div key={s.key} className={[styles.stageItem, i <= activeStage ? styles.stageActive : '', i < activeStage ? styles.stageDone : ''].join(' ')}>
                <span className={styles.stageDot}>{i < activeStage ? '✓' : i === activeStage ? '⟳' : ''}</span>
                {s.label}
              </div>
            ))}
          </div>
        </Card>
      )}

      {status === 'RE_COMPLETE' && (
        <Card accent>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <h2>Reverse Engineering Complete!</h2>
            <p className={styles.muted}>14 artifacts generated and ready for review.</p>
            <Button size="lg" onClick={() => navigate(`/jobs/${jobId}/artifacts`)}>
              View Artifacts →
            </Button>
          </div>
        </Card>
      )}

      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
