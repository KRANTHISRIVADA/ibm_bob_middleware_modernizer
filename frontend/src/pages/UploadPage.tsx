import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { uploadFile } from '../services/api';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import styles from './Pages.module.css';

const ALLOWED = '.yaml,.yml,.json,.zip,.wsdl,.xsd,.xml';
const MAX_MB = 50;

export default function UploadPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    setError('');
    if (rejected.length) { setError(`File rejected: ${rejected[0].errors[0].message}`); return; }
    if (accepted.length) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: MAX_MB * 1024 * 1024,
    accept: {
      'application/zip': ['.zip'],
      'text/yaml': ['.yaml', '.yml'],
      'application/json': ['.json'],
      'text/xml': ['.xml', '.xsd', '.wsdl'],
    },
  });

  const upload = async () => {
    if (!file || !jobId || uploading) return;
    setUploading(true); setError('');
    try {
      await uploadFile(jobId, file);
      setDone(true);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Upload failed');
    } finally { setUploading(false); }
  };

  const formatBytes = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Upload Source Artifacts</h1>
          <p className={styles.pageSubtitle}>Job ID: {jobId}</p>
        </div>
      </div>

      {!done ? (
        <Card title="Upload Source File" accent>
          <div {...getRootProps()} className={[styles.dropzone, isDragActive ? styles.dragOver : ''].join(' ')}>
            <input {...getInputProps()} />
            <div className={styles.dropzoneContent}>
              <div className={styles.dropzoneIcon}>↑</div>
              {isDragActive ? (
                <p>Drop your file here...</p>
              ) : (
                <>
                  <p>Drag & drop your source artifact here, or <strong>click to browse</strong></p>
                  <p className={styles.muted}>Supports: YAML, JSON, ZIP, WSDL, XSD, XML — Max {MAX_MB}MB</p>
                </>
              )}
            </div>
          </div>

          {file && (
            <div className={styles.filePreview}>
              <span className={styles.fileIcon}>📄</span>
              <div>
                <div className={styles.fileName}>{file.name}</div>
                <div className={styles.muted}>{formatBytes(file.size)}</div>
              </div>
              <button className={styles.removeBtn} onClick={() => setFile(null)}>✕</button>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <Button onClick={upload} disabled={!file} loading={uploading} size="lg">
              Upload & Continue
            </Button>
          </div>
        </Card>
      ) : (
        <Card accent>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <h2>File Uploaded Successfully</h2>
            <p className={styles.muted}>{file?.name} is ready for reverse engineering.</p>
            <Button size="lg" onClick={() => navigate(`/jobs/${jobId}/reverse`)}>
              Proceed to Reverse Engineering →
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
