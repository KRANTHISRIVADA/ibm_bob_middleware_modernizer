import React from 'react';
import styles from './StatusBadge.module.css';
import clsx from 'clsx';

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  CREATED: { label: 'Created', cls: 'gray' },
  UPLOADED: { label: 'Uploaded', cls: 'blue' },
  RE_IN_PROGRESS: { label: 'Reverse Engineering...', cls: 'yellow' },
  RE_COMPLETE: { label: 'RE Complete', cls: 'green' },
  RE_FAILED: { label: 'RE Failed', cls: 'red' },
  GEN_IN_PROGRESS: { label: 'Generating...', cls: 'yellow' },
  GEN_COMPLETE: { label: 'Generation Complete', cls: 'teal' },
  GEN_FAILED: { label: 'Generation Failed', cls: 'red' },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, cls: 'gray' };
  return <span className={clsx(styles.badge, styles[s.cls])}>{s.label}</span>;
}
