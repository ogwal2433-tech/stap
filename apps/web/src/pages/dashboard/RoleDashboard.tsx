import { Alert, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
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

  // Only roles whose payload carries it — everyone else sees nothing.
  const failedJobs = Number(data.stats.failedJobs ?? 0);

  return (
    <div>
      <div className="text-uppercase text-muted fw-semibold mb-3" style={{ fontSize: '0.72rem', letterSpacing: '0.06em' }}>
        {spec.caption}
      </div>

      {/* A background job that stops working is otherwise silent — invoices
          simply stop being raised. Shown as a banner rather than one tile among
          a dozen, because it needs acting on rather than reading. */}
      {failedJobs > 0 && (
        <Alert variant="danger" className="d-flex flex-wrap align-items-center gap-3 py-2">
          <div className="flex-grow-1">
            <div className="fw-bold">
              {failedJobs} scheduled job{failedJobs === 1 ? '' : 's'} failed on the last run
            </div>
            <div className="small">
              Work that should happen on its own is not happening. Check the error and re-run.
            </div>
          </div>
          <Link to="/settings/scheduled-jobs" className="btn btn-sm btn-danger">
            View jobs
          </Link>
        </Alert>
      )}

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
