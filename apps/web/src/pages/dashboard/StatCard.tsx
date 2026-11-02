import { Link } from 'react-router-dom';

export type StatColour = 'navy' | 'teal' | 'amber' | 'red' | 'green' | 'grey';

const COLOURS: Record<StatColour, { bg: string; accent: string; text: string }> = {
  navy:  { bg: '#D6E0F0', accent: '#1B3A6B', text: '#1B3A6B' },
  teal:  { bg: '#D0EDE9', accent: '#0F7B6C', text: '#0F7B6C' },
  amber: { bg: '#FEF9E7', accent: '#E8701A', text: '#E8701A' },
  red:   { bg: '#FDECEA', accent: '#C0392B', text: '#C0392B' },
  green: { bg: '#D5F5E3', accent: '#1E8449', text: '#1E8449' },
  grey:  { bg: '#F2F4F7', accent: '#6c757d', text: '#6c757d' },
};

import type { ReactNode } from 'react';

interface StatCardProps {
  label:    string;
  value:    string | number;
  icon:     string | ReactNode;
  colour:   StatColour;
  linkTo?:  string;
  subtext?: string;
}

export default function StatCard({ label, value, icon, colour, linkTo, subtext }: StatCardProps) {
  const c = COLOURS[colour] ?? COLOURS.navy;

  const card = (
    <div
      style={{
        background:   c.bg,
        borderRadius: '0.75rem',
        padding:      '16px 18px',
        borderLeft:   `4px solid ${c.accent}`,
        height:       '100%',
        cursor:       linkTo ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: '1.4rem', marginBottom: '2px' }}>{icon}</div>
      <div style={{ fontSize: '1.65rem', fontWeight: 800, color: c.text, lineHeight: 1.1 }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#4A5568', fontWeight: 500 }}>{label}</div>
      {subtext && <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: '2px' }}>{subtext}</div>}
    </div>
  );

  return linkTo
    ? <Link to={linkTo} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{card}</Link>
    : card;
}
