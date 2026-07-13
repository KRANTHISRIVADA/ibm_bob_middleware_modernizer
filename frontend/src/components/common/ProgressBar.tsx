import React from 'react';
import styles from './ProgressBar.module.css';

const STEPS = [
  'Create Job',
  'Upload Source',
  'Reverse Engineer',
  'Review Artifacts',
  'Select Target',
  'Generate Code',
  'Download',
];

const STEP_STATUS_MAP: Record<string, number> = {
  CREATED: 0,
  UPLOADED: 1,
  RE_IN_PROGRESS: 2,
  RE_COMPLETE: 3,
  GEN_IN_PROGRESS: 5,
  GEN_COMPLETE: 6,
  GEN_FAILED: 4,
  RE_FAILED: 2,
};

export default function ProgressBar({ status }: { status: string }) {
  const currentStep = STEP_STATUS_MAP[status] ?? 0;
  const pct = Math.round((currentStep / (STEPS.length - 1)) * 100);
  return (
    <div className={styles.wrapper}>
      <div className={styles.bar}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.steps}>
        {STEPS.map((s, i) => (
          <div key={s} className={[styles.step, i <= currentStep ? styles.done : '', i === currentStep ? styles.current : ''].join(' ')}>
            <div className={styles.dot}>{i < currentStep ? '✓' : i + 1}</div>
            <div className={styles.label}>{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
