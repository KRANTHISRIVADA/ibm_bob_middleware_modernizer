import React from 'react';
import { useParams } from 'react-router-dom';
import { downloadReverseArtifactsUrl, downloadGeneratedUrl } from '../services/api';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import styles from './Pages.module.css';

export default function DownloadPage() {
  const { jobId } = useParams<{ jobId: string }>();

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Download Artifacts</h1>
          <p className={styles.pageSubtitle}>Job ID: {jobId}</p>
        </div>
      </div>

      <div className={styles.downloadGrid}>
        <Card title="Reverse Engineering Artifacts" accent>
          <p style={{ marginBottom: 16 }}>Contains 14 Markdown and JSON documents: Executive Summary, Endpoint Catalog, Security Analysis, Complexity Assessment, Migration Recommendations, Test Scenarios, and more.</p>
          <ul className={styles.downloadList}>
            <li>14 structured Markdown documents</li>
            <li>Full reverse engineering JSON</li>
            <li>OpenAPI specification for target service</li>
          </ul>
          <a href={downloadReverseArtifactsUrl(jobId!)} download>
            <Button style={{ marginTop: 20 }}>⬇ Download Reverse Engineering ZIP</Button>
          </a>
        </Card>

        <Card title="Generated Microservice Code">
          <p style={{ marginBottom: 16 }}>Production-ready microservice source code with controllers, services, mappers, backend clients, security, tests, Dockerfile, Kubernetes YAML, and README.</p>
          <ul className={styles.downloadList}>
            <li>Complete source code</li>
            <li>Unit and integration tests</li>
            <li>Dockerfile + docker-compose</li>
            <li>Kubernetes deployment YAML</li>
            <li>Postman collection</li>
            <li>CI pipeline sample</li>
          </ul>
          <a href={downloadGeneratedUrl(jobId!)} download>
            <Button style={{ marginTop: 20 }}>⬇ Download Generated Code ZIP</Button>
          </a>
        </Card>
      </div>
    </div>
  );
}
