import { Col, Row } from 'react-bootstrap';
import type { DashboardData } from '@stap/shared';
import StatCard from './StatCard';
import FeedCard from './FeedCard';
import { specForRole } from './roleDashboards';

/**
 * Renders whichever set of cards and feeds the signed-in user's role is
 * configured with. Stat keys absent from the payload are skipped rather than
 * rendered as zero, so a role never shows a figure the API didn't send.
 */
export default function RoleDashboard({ data }: { data: DashboardData }) {
  const spec = specForRole(data);

  const stats = spec.stats.filter(s => data.stats[s.key] !== undefined);

  return (
    <div>
      <div className="text-uppercase text-muted fw-semibold mb-3" style={{ fontSize: '0.72rem', letterSpacing: '0.06em' }}>
        {spec.caption}
      </div>

      <Row xs={2} md={3} lg={4} className="g-3 mb-4">
        {stats.map(s => {
          const raw = data.stats[s.key];
          return (
            <Col key={s.key}>
              <StatCard
                label={s.label}
                icon={s.icon}
                colour={typeof s.colour === 'function' ? s.colour(raw) : s.colour}
                value={s.format ? s.format(raw) : raw}
                linkTo={s.linkTo}
                subtext={s.subtext}
              />
            </Col>
          );
        })}
      </Row>

      <Row className="g-3">
        {spec.feeds.map(f => (
          <Col md={spec.feeds.length >= 3 ? 4 : 6} key={f.key}>
            <FeedCard
              title={f.title}
              icon={f.icon}
              items={data.feeds[f.key] ?? []}
              emptyText={f.emptyText}
              linkTo={f.linkTo}
              itemLink={f.itemLink}
            />
          </Col>
        ))}
      </Row>
    </div>
  );
}
