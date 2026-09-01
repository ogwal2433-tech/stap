import api from './api';

export interface JobRunLogRow {
  id:          string;
  startedAt:   string;
  finishedAt:  string | null;
  status:      string;
  duration:    number | null;
  result:      unknown;
  error:       string | null;
  triggeredBy: string;
}

export interface ScheduledJobRow {
  key:             string;
  name:            string;
  description:     string | null;
  cronExpr:        string;
  cronHuman:       string;
  category:        string;
  isActive:        boolean;
  lastRunAt:       string | null;
  lastRunStatus:   string | null;
  lastRunDuration: number | null;
  lastRunError:    string | null;
  nextRunAt:       string | null;
  totalRuns:       number;
  totalFailed:     number;
  /** False when the row has no implementation in this build. */
  isRegistered:    boolean;
  logs:            JobRunLogRow[];
}

export const scheduledJobsApi = {
  list(): Promise<ScheduledJobRow[]> {
    return api.get('/scheduled-jobs').then(r => r.data.data);
  },
  get(key: string): Promise<ScheduledJobRow> {
    return api.get(`/scheduled-jobs/${key}`).then(r => r.data.data);
  },
  setActive(key: string, active: boolean): Promise<ScheduledJobRow> {
    return api.patch(`/scheduled-jobs/${key}/${active ? 'resume' : 'pause'}`).then(r => r.data.data);
  },
  trigger(key: string): Promise<{ message: string }> {
    return api.post(`/scheduled-jobs/${key}/trigger`).then(r => r.data);
  },
};
