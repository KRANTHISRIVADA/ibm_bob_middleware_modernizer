import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listReverseArtifacts, downloadReverseArtifactsUrl, type ArtifactFile } from '../services/api';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import styles from './Pages.module.css';

const ARTIFACT_DESCRIPTIONS: Record<string, string> = {
  '01-executive-summary.md': 'High-level summary of the modernization analysis',
  '02-interface-inventory.md': 'Complete inventory of all discovered interfaces',
  '03-endpoint-catalog.md': 'Detailed catalog of all API endpoints',
  '04-source-target-mapping.md': 'Field-level source to target mapping specification',
  '05-request-response-schemas.md': 'Request and response schema definitions',
  '06-transformation-mapping.md': 'Data transformation and conversion logic',
  '07-routing-document.md': 'Routing rules and backend endpoint definitions',
  '08-security-analysis.md': 'Security policy analysis (OAuth, JWT, mTLS, API Keys)',
  '09-error-handling.md': 'Error handling and fault mapping document',
  '10-non-functional-requirements.md': 'NFRs: timeout, retry, logging, rate limits',
  '11-complexity-assessment.md': 'Complexity scoring and assessment report',
  '12-migration-recommendation.md': 'Target stack recommendation and effort estimate',
  '13-test-scenarios.md': 'Unit, integration, and contract test inventory',
  '14-target-openapi-spec.json': 'Target microservice OpenAPI specification',
  'full-reverse-engineering.json': 'Complete machine-readable reverse engineering output',
};

function formatBytes(b: number) {
  return b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function ArtifactViewerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [artifacts, setArtifacts] = useState<ArtifactFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listReverseArtifacts(jobId!)
      .then(res => setArtifacts(res.data.artifacts))
      .catch(() => setError('Failed to load artifacts'))
      .finally(() => setLoading(false));
  }, [jobId]);

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Reverse Engineering Artifacts</h1>
          <p className={styles.pageSubtitle}>Job ID: {jobId} — {artifacts.length} artifacts generated</p>
        </div>
        <a href={downloadReverseArtifactsUrl(jobId!)} download>
          <Button variant="secondary">⬇ Download All as ZIP</Button>
        </a>
      </div>

      {loading && <p className={styles.muted}>Loading artifacts...</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && artifacts.length === 0 && (
        <Card>
          <p>No artifacts found. Please run reverse engineering first.</p>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/jobs/${jobId}/reverse`)}>Go to Reverse Engineering</Button>
        </Card>
      )}

      {artifacts.length > 0 && (
        <Card>
          <div className={styles.artifactList}>
            {artifacts.map(a => (
              <div key={a.name} className={styles.artifactItem}>
                <div className={styles.artifactIcon}>
                  {a.name.endsWith('.json') ? '{ }' : a.name.endsWith('.md') ? '# ' : '📄'}
                </div>
                <div className={styles.artifactInfo}>
                  <div className={styles.artifactName}>{a.name}</div>
                  <div className={styles.muted}>{ARTIFACT_DESCRIPTIONS[a.name] || ''} — {formatBytes(a.size)}</div>
                </div>
                <a href={`/api${a.url.replace(/^\/api/, '')}`} download>
                  <Button variant="ghost" size="sm">⬇ Download</Button>
                </a>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className={styles.actions}>
        <Button size="lg" onClick={() => navigate(`/jobs/${jobId}/generate`)}>
          Proceed to Code Generation →
        </Button>
      </div>
    </div>
  );
}
