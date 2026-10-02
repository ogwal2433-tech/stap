import { describe, it, expect } from 'vitest';
import { GuardListQuerySchema, GuardExportQuerySchema } from '@security360/shared';

/**
 * The two guard queries are one contract, written twice on purpose.
 *
 * GET /guards pages the roll; GET /guards/export(+/pdf) takes the same filters
 * unpaged. Every filter added to the table has to reach the downloads too, and
 * the way to make forgetting that loud is to compare the parsed result of the
 * same query string against both schemas here.
 */

const FILTERS = {
  idType:          'OWN_ID',
  search:          'okel',
  status:          'ACTIVE',
  rank:            'SENIOR_GUARD',
  contractType:    'PERMANENT',
  probationStatus: 'CONFIRMED',
  nidStatus:       'PROVIDED',
  isIncompleteNID: 'true',
  onLeave:         'true',
};

const FILTER_KEYS = Object.keys(FILTERS);

describe('GuardExportQuerySchema', () => {
  it('takes every filter the list takes, with the same meaning', () => {
    const list    = GuardListQuerySchema.parse(FILTERS);
    const asQuery = GuardExportQuerySchema.parse(FILTERS);

    for (const key of FILTER_KEYS) {
      expect(asQuery, key).toHaveProperty(key);
      // Not just accepted — parsed to the same value the table filters on.
      expect((asQuery as Record<string, unknown>)[key], key).toEqual(
        (list as unknown as Record<string, unknown>)[key],
      );
    }
  });

  it('parses on its own, with nothing required', () => {
    expect(GuardExportQuerySchema.parse({})).toEqual({});
  });

  it('drops paging instead of failing on it', () => {
    // An export never pages. A stale ?page=2&limit=50 left on the query string
    // must not error and must not be honoured downstream.
    const parsed = GuardExportQuerySchema.parse({ page: '2', limit: '50', status: 'ACTIVE' });
    expect(parsed).not.toHaveProperty('page');
    expect(parsed).not.toHaveProperty('limit');
    expect(parsed.status).toBe('ACTIVE');
  });

  it('refuses a status it does not know', () => {
    expect(GuardExportQuerySchema.safeParse({ status: 'EVERYONE' }).success).toBe(false);
  });

  it('refuses a probation value it does not know', () => {
    expect(GuardExportQuerySchema.safeParse({ probationStatus: 'MAYBE' }).success).toBe(false);
  });

  it('reads the yes/no filters out of a query string', () => {
    // Both are sent as 'true' by the page, which only ever offers the positive.
    expect(GuardExportQuerySchema.parse({ isIncompleteNID: 'true' }).isIncompleteNID).toBe(true);
    expect(GuardExportQuerySchema.parse({ onLeave: 'true' }).onLeave).toBe(true);
  });

  it('keeps idType free-form, because NONE is not a document type', () => {
    // The roll asks for guards holding no document at all with a value the
    // GUARD_ID_TYPES list does not contain.
    expect(GuardExportQuerySchema.parse({ idType: 'NONE' }).idType).toBe('NONE');
  });
});
