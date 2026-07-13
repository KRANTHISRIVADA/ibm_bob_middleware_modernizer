import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createJob } from '../services/api';
import { useAppStore } from '../store/appStore';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import styles from './Pages.module.css';

const PLATFORMS = [
  { id: 'APIC', label: 'IBM API Connect', desc: 'YAML / OpenAPI / Swagger files' },
  { id: 'DATAPOWER', label: 'IBM DataPower', desc: 'ZIP export with MPGW/WSP configuration' },
  { id: 'IIB_ACE', label: 'IBM IIB / ACE', desc: 'Project ZIP with message flows, ESQL, schemas' },
] as const;

const COMPLEXITIES = [
  { id: 'SIMPLE', label: 'Simple', desc: 'Proxy APIs, pass-through routing, minimal policy logic' },
  { id: 'INTERMEDIATE', label: 'Intermediate', desc: 'Transformations, mappings, conditional routing, security policies' },
  { id: 'COMPLEX', label: 'Complex', desc: 'Orchestration, multiple backends, custom policies, GatewayScript, ESQL, XSLT' },
] as const;

export default function NewJobPage() {
  const navigate = useNavigate();
  const setCurrentJob = useAppStore(s => s.setCurrentJob);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<'APIC' | 'DATAPOWER' | 'IIB_ACE' | ''>('');
  const [complexity, setComplexity] = useState<'SIMPLE' | 'INTERMEDIATE' | 'COMPLEX' | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const valid = name.trim() && platform && complexity;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true); setError('');
    try {
      const res = await createJob({ name: name.trim(), sourcePlatform: platform as any, complexity: complexity as any, description });
      setCurrentJob(res.data);
      navigate(`/jobs/${res.data.jobId}/upload`);
    } catch (err: any) {
      setError(err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Failed to create job');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>New Modernization Job</h1>
          <p className={styles.pageSubtitle}>Configure your modernization job details</p>
        </div>
      </div>

      <Card title="Job Details" accent>
        <div className={styles.formGroup}>
          <label className={styles.label}>Job Name *</label>
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Customer API Migration" />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Description</label>
          <textarea className={styles.textarea} value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of the migration..." rows={3} />
        </div>
      </Card>

      <Card title="Select Source Platform">
        <div className={styles.optionGrid}>
          {PLATFORMS.map(p => (
            <button key={p.id} className={[styles.optionCard, platform === p.id ? styles.selected : ''].join(' ')} onClick={() => setPlatform(p.id)}>
              <div className={styles.optionTitle}>{p.label}</div>
              <div className={styles.optionDesc}>{p.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Select Complexity">
        <div className={styles.optionGrid}>
          {COMPLEXITIES.map(c => (
            <button key={c.id} className={[styles.optionCard, complexity === c.id ? styles.selected : ''].join(' ')} onClick={() => setComplexity(c.id)}>
              <div className={styles.optionTitle}>{c.label}</div>
              <div className={styles.optionDesc}>{c.desc}</div>
            </button>
          ))}
        </div>
      </Card>

      {error && <p className={styles.error}>{error}</p>}
      <Button onClick={submit} disabled={!valid} loading={loading} size="lg">Create Job & Proceed to Upload →</Button>
    </div>
  );
}
