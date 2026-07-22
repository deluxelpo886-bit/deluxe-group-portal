import React from 'react';
import { STATUS_COLORS } from '../lib/catalogue';

export default function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'var(--steel)';
  return (
    <span className="badge" style={{ background: color }}>
      {status || 'New'}
    </span>
  );
}
