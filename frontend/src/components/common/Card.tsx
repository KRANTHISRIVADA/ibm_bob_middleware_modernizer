import React from 'react';
import styles from './Card.module.css';
import clsx from 'clsx';

interface Props {
  title?: string;
  children: React.ReactNode;
  className?: string;
  accent?: boolean;
}

export default function Card({ title, children, className, accent }: Props) {
  return (
    <div className={clsx(styles.card, accent && styles.accent, className)}>
      {title && <h2 className={styles.title}>{title}</h2>}
      {children}
    </div>
  );
}
