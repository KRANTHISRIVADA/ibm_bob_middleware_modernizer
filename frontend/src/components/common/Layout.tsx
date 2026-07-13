import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/jobs/new', label: 'New Job' },
  { to: '/history', label: 'Job History' },
];

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>⬡</span>
          <span className={styles.brandName}>AI Modernizer</span>
          <span className={styles.brandSub}>IBM Middleware Accelerator</span>
        </div>
        <nav className={styles.nav}>
          {NAV_LINKS.map(l => (
            <Link
              key={l.to}
              to={l.to}
              className={[styles.navLink, pathname === l.to ? styles.active : ''].join(' ')}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        AI Modernizer v1.0 — IBM Middleware Migration Accelerator
      </footer>
    </div>
  );
}
