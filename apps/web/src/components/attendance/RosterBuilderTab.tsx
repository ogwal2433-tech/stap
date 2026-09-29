import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Form, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useCreateRoster } from '../../hooks/useAttendance';
import { useMyZones, useZones, useZoneRosterData } from '../../hooks/useZones';
import { clientsApi } from '../../lib/clients.api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { getApiErrorMessage } from '../../lib/api';
import type { ConflictDetail, ZoneSite, ZoneRosterGuard } from '@security360/shared';
import InitialsAvatar from '../ui/InitialsAvatar';
import { exportRosterDraft } from '../../lib/exportToExcel';
import { useCompanyBranding } from '../../hooks/useCompanyBranding';

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const SHIFT_LABELS: Record<string, string> = { DAY: 'Day', NIGHT: 'Night', FULL_24: '24hr' };
const shiftLabel = (code: string) => SHIFT_LABELS[code] ?? code.replace(/_/g, ' ');

/** Fallback when a site resolves no shift at all — the API still requires one. */
const ALL_SHIFTS = ['DAY', 'NIGHT', 'FULL_24'];

const ADMIN_ROLES = ['DIRECTOR', 'ASSISTANT_MANAGER'];

// ── Types ──────────────────────────────────────────────────────────────────────

interface SelectedGuard {
  id:        string;
  firstName: string;
  lastName:  string;
  rank:      string | null;
  photoUrl:  string | null;
}

/**
 * One site's in-progress roster. Held per site so the user can work through a
 * zone site by site without losing what they entered for the earlier ones.
 */
interface SiteRoster {
  shift:        string;
  /** Shifts this site may run. More than one means the user must choose. */
  shiftOptions: string[];
  shiftNote:    string;
  date:         string;
  guards:       SelectedGuard[];
  saved:        boolean;
  savedCount:   number;
  conflicts:    ConflictDetail[];
}

const emptyRoster = (date: string): SiteRoster => ({
  shift: '', shiftOptions: [], shiftNote: '', date,
  guards: [], saved: false, savedCount: 0, conflicts: [],
});

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Step-by-step roster builder.
 *
 * Sites are a vertical accordion and only one is ever open: clicking a site
 * expands its guard assignment inside that same card, so the user never scrolls
 * away from the site they picked. Saving collapses it to a summary and opens the
 * next unrostered site, which is what makes a whole zone workable in one pass.
 */
export default function RosterBuilderTab() {
  const { data: companyBranding } = useCompanyBranding();
  const { showToast } = useToast();
  const { user } = useAuth();
  const createRoster = useCreateRoster();

  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');

  // ── Zone data (role-based) ──────────────────────────────────────────────────
  const { data: adminZonesData, isLoading: adminZonesLoading } = useZones({ isActive: true });
  const { data: myZonesRaw, isLoading: myZonesLoading } = useMyZones();

  const zones = isAdmin ? (adminZonesData?.data ?? []) : (myZonesRaw ?? []);
  const zonesLoading = isAdmin ? adminZonesLoading : myZonesLoading;

  // ── State ───────────────────────────────────────────────────────────────────
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [rosterDate,     setRosterDate]     = useState(todayStr());
  const [openSiteId,     setOpenSiteId]     = useState<string | null>(null);
  const [rosters,        setRosters]        = useState<Record<string, SiteRoster>>({});
  const [guardSearch,    setGuardSearch]    = useState('');

  const { data: rosterData, isLoading: rosterDataLoading } =
    useZoneRosterData(selectedZoneId || null, rosterDate);

  const zoneSites: ZoneSite[] = rosterData?.sites ?? [];
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  // Someone supervising exactly one zone never needs to choose it.
  useEffect(() => {
    if (zones.length === 1 && !selectedZoneId) setSelectedZoneId(zones[0].id);
  }, [zones, selectedZoneId]);

  const openSite  = zoneSites.find((s) => s.id === openSiteId) ?? null;
  const openEntry = openSiteId ? rosters[openSiteId] : undefined;

  const savedCount = useMemo(
    () => zoneSites.filter((s) => rosters[s.id]?.saved).length,
    [zoneSites, rosters],
  );
  const allDone = zoneSites.length > 0 && savedCount === zoneSites.length;

  /**
   * Guards already spoken for on this date — either rostered elsewhere earlier,
   * or placed at another site in this session. Hiding them here beats letting
   * the user build an assignment the API will reject as a conflict.
   */
  const takenGuardIds = useMemo(() => {
    const taken = new Set<string>();
    for (const [siteId, entry] of Object.entries(rosters)) {
      if (siteId === openSiteId) continue;
      entry.guards.forEach((g) => taken.add(g.id));
    }
    return taken;
  }, [rosters, openSiteId]);

  const selectedIds = useMemo(
    () => new Set((openEntry?.guards ?? []).map((g) => g.id)),
    [openEntry],
  );

  const availableGuards = useMemo(() => {
    const all: ZoneRosterGuard[] = rosterData?.guards ?? [];
    const q = guardSearch.trim().toLowerCase();
    return all
      .filter((g) => !selectedIds.has(g.id) && !takenGuardIds.has(g.id))
      .filter((g) => !q || g.fullName.toLowerCase().includes(q));
  }, [rosterData, selectedIds, takenGuardIds, guardSearch]);

  const requiredGuards = openSite?.guardsRequired ?? 0;
  const chosen         = openEntry?.guards.length ?? 0;
  const isAtLimit      = requiredGuards > 0 && chosen >= requiredGuards;
  const isOverLimit    = requiredGuards > 0 && chosen > requiredGuards;

  // ── Roster mutation helpers ─────────────────────────────────────────────────

  const patchRoster = (siteId: string, patch: Partial<SiteRoster>) =>
    setRosters((prev) => ({
      ...prev,
      [siteId]: { ...(prev[siteId] ?? emptyRoster(rosterDate)), ...patch },
    }));

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /** Opens a site, initialising it and resolving its shift the first time. */
  async function openSiteCard(site: ZoneSite) {
    if (openSiteId === site.id) { setOpenSiteId(null); return; }

    setOpenSiteId(site.id);
    setGuardSearch('');

    // Keep the card in view — it may sit below the fold in a large zone.
    setTimeout(() => {
      cardRefs.current[site.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);

    if (rosters[site.id]) return;

    setRosters((prev) => ({ ...prev, [site.id]: emptyRoster(rosterDate) }));

    try {
      const res     = await clientsApi.getSiteShift(site.id);
      const options = res.shiftOptions.length ? res.shiftOptions : ALL_SHIFTS;
      patchRoster(site.id, {
        shift:        res.shift ?? (options.length === 1 ? options[0] : ''),
        shiftOptions: options,
        shiftNote:    res.note,
      });
    } catch {
      // Shift lookup is a convenience — fall back to letting the user choose.
      patchRoster(site.id, {
        shiftOptions: ALL_SHIFTS,
        shiftNote:    'Could not read the contract shift — please choose one.',
      });
    }
  }

  function addGuard(siteId: string, guard: ZoneRosterGuard) {
    if (isAtLimit) return;
    setRosters((prev) => {
      const entry = prev[siteId] ?? emptyRoster(rosterDate);
      if (entry.guards.some((g) => g.id === guard.id)) return prev;
      return {
        ...prev,
        [siteId]: {
          ...entry,
          saved:  false,
          guards: [...entry.guards, {
            id: guard.id, firstName: guard.firstName, lastName: guard.lastName,
            rank: guard.rank, photoUrl: guard.photoUrl,
          }],
        },
      };
    });
  }

  function removeGuard(siteId: string, guardId: string) {
    setRosters((prev) => {
      const entry = prev[siteId];
      if (!entry) return prev;
      return {
        ...prev,
        [siteId]: { ...entry, saved: false, guards: entry.guards.filter((g) => g.id !== guardId) },
      };
    });
  }

  /** Applies a new date to every site not yet saved. */
  function changeRosterDate(date: string) {
    setRosterDate(date);
    setRosters((prev) => {
      const next: Record<string, SiteRoster> = {};
      for (const [siteId, entry] of Object.entries(prev)) {
        next[siteId] = entry.saved ? entry : { ...entry, date, guards: [] };
      }
      return next;
    });
  }

  function nextUnsavedSite(afterSiteId: string): ZoneSite | undefined {
    const idx = zoneSites.findIndex((s) => s.id === afterSiteId);
    const ordered = [...zoneSites.slice(idx + 1), ...zoneSites.slice(0, Math.max(idx, 0))];
    return ordered.find((s) => !rosters[s.id]?.saved);
  }

  async function saveSite(site: ZoneSite) {
    const entry = rosters[site.id];
    if (!entry) return;

    if (entry.guards.length === 0) {
      showToast('Add at least one guard before saving this site.', 'danger');
      return;
    }
    if (!entry.shift) {
      showToast('Select a shift for this site before saving.', 'danger');
      return;
    }

    try {
      const result = await createRoster.mutateAsync({
        siteId:       site.id,
        guardIds:     entry.guards.map((g) => g.id),
        supervisorId: selectedZone?.supervisorId ?? user!.id,
        shiftType:    entry.shift,
        startDate:    `${entry.date}T00:00:00.000Z`,
        recurring:    false,
      });

      patchRoster(site.id, {
        saved:      true,
        savedCount: result.created,
        conflicts:  result.conflicts,
      });

      showToast(
        result.conflicts.length
          ? `${site.siteName}: ${result.created} deployed, ${result.conflicts.length} skipped.`
          : `${site.siteName} rostered — ${result.created} guard(s).`,
        result.conflicts.length ? 'danger' : 'success',
      );

      setOpenSiteId(null);

      // Straight on to the next site that still needs doing.
      const next = nextUnsavedSite(site.id);
      if (next) setTimeout(() => { void openSiteCard(next); }, 250);
    } catch (err) {
      // Re-saving a site nobody changed comes back as "all already deployed".
      // That is the roster already being correct, not a failure worth alarming
      // the user with.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409 && entry.saved) {
        showToast(`${site.siteName} is already rostered for this date — nothing to change.`, 'success');
        setOpenSiteId(null);
        return;
      }
      showToast(getApiErrorMessage(err, 'Could not save this site. Please try again.'), 'danger');
    }
  }

  function handleExport(site: ZoneSite) {
    const entry = rosters[site.id];
    if (!entry || entry.guards.length === 0 || !entry.shift) return;
    exportRosterDraft({
      zoneName:       selectedZone?.name ?? 'No Zone',
      siteName:       site.siteName,
      clientName:     site.client.clientName,
      location:       site.location,
      date:           entry.date,
      shiftType:      entry.shift,
      supervisorName: selectedZone?.supervisor?.name ?? user?.name ?? 'N/A',
      guardsRequired: site.guardsRequired,
      guards:         entry.guards,
    }, companyBranding.company_name);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <Alert variant="info" className="py-2 small mb-3">
        Entering several sites at once? The{' '}
        <Link to="/attendance/deployment-sheet">deployment sheet</Link> lets you fill in
        site, guard, shift, status and date row by row and save them all together.
      </Alert>

      {/* ── Header + progress ────────────────────────────────────────────── */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <div className="fw-bold" style={{ color: '#1B3A6B' }}>📋 Roster Builder</div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>
            Assign guards to one site at a time
          </div>
        </div>
        {selectedZoneId && zoneSites.length > 0 && (
          <div style={{
            background: '#F2F4F7', borderRadius: '0.5rem',
            padding: '6px 14px', fontSize: '0.82rem',
          }}>
            <span className="fw-bold" style={{ color: savedCount ? '#1E8449' : '#6c757d' }}>
              {savedCount}
            </span>
            <span className="text-muted"> / {zoneSites.length} sites rostered</span>
          </div>
        )}
      </div>

      {/* ── STEP 1: Zone ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'white', border: '1px solid #e9ecef',
        borderRadius: '0.75rem', padding: '18px', marginBottom: '18px',
      }}>
        <div className="d-flex align-items-center gap-2 mb-2">
          <span style={{
            width: 26, height: 26, borderRadius: '50%',
            background: selectedZoneId ? '#1E8449' : '#1B3A6B', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
          }}>
            {selectedZoneId ? '✓' : '1'}
          </span>
          <span className="fw-bold" style={{ fontSize: '0.92rem' }}>Select Zone</span>
          {selectedZone && (
            <Badge bg="success" className="ms-auto" style={{ fontSize: '0.72rem' }}>
              {selectedZone.name}
            </Badge>
          )}
        </div>

        {zonesLoading ? (
          <div className="text-muted small"><Spinner size="sm" animation="border" className="me-2" />Loading zones…</div>
        ) : zones.length === 0 ? (
          <Alert variant="warning" className="mb-0 py-2 small">
            ⚠️ You are not assigned to a zone yet. Contact the Administrator to have your
            zone set up before building a roster.
          </Alert>
        ) : zones.length === 1 ? (
          <div style={{
            background: '#D6E0F0', borderRadius: '0.375rem', padding: '8px 12px',
            fontSize: '0.82rem', color: '#1B3A6B', fontWeight: 600,
          }}>
            📍 Your zone: {zones[0].name} · {zoneSites.length} site(s)
          </div>
        ) : (
          <>
            <Form.Select
              value={selectedZoneId}
              onChange={(e) => {
                setSelectedZoneId(e.target.value);
                setOpenSiteId(null);
                setRosters({});
              }}
              style={{ fontSize: '0.88rem' }}
            >
              <option value="">— Select a zone to begin —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} ({z.siteCount} site{z.siteCount === 1 ? '' : 's'})
                </option>
              ))}
            </Form.Select>
            {!selectedZoneId && (
              <div className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
                Start by selecting the zone you are building a roster for.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── STEP 2 + 3: Sites, each expanding in place ───────────────────── */}
      {selectedZoneId && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
            background: '#F8F9FA', padding: '9px 14px',
            borderRadius: '0.5rem', marginBottom: '14px', fontSize: '0.82rem',
          }}>
            <span className="text-muted fw-semibold">📅 Roster date:</span>
            <input
              type="date"
              value={rosterDate}
              onChange={(e) => changeRosterDate(e.target.value)}
              style={{
                padding: '4px 8px', border: '1px solid #ced4da',
                borderRadius: '0.375rem', fontSize: '0.82rem',
              }}
            />
            <span className="text-muted">Applies to every site not yet saved</span>
          </div>

          {rosterDataLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" variant="primary" />
            </div>
          ) : zoneSites.length === 0 ? (
            <div style={{
              border: '2px dashed #ced4da', borderRadius: '0.5rem',
              padding: '36px', textAlign: 'center', color: '#6c757d',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 6 }}>🏢</div>
              <div className="fw-bold mb-1">No sites in this zone</div>
              <div style={{ fontSize: '0.82rem' }}>
                Assign sites to this zone on the Zones page before building a roster.
              </div>
            </div>
          ) : (
            <>
              {!openSiteId && !allDone && (
                <div style={{
                  background: '#EBF5FB', borderLeft: '3px solid #1B3A6B',
                  borderRadius: '0.5rem', padding: '9px 14px', marginBottom: '12px',
                  fontSize: '0.82rem', color: '#1B3A6B',
                }}>
                  👆 Click a site below to assign guards to it. The assignment opens right
                  here on the site — no scrolling.
                </div>
              )}

              {zoneSites.map((site) => {
                const entry      = rosters[site.id];
                const isOpen     = openSiteId === site.id;
                const isSaved    = entry?.saved ?? false;
                const shiftFixed = (entry?.shiftOptions.length ?? 0) <= 1;

                return (
                  <div
                    key={site.id}
                    ref={(el) => { cardRefs.current[site.id] = el; }}
                    style={{
                      marginBottom: '10px', borderRadius: '0.75rem', overflow: 'hidden',
                      border: `2px solid ${isSaved ? '#1E8449' : isOpen ? '#1B3A6B' : '#e9ecef'}`,
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    {/* Site header — always visible, click to open */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => { void openSiteCard(site); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openSiteCard(site); }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: '10px', padding: '13px 16px', cursor: 'pointer', userSelect: 'none',
                        background: isSaved ? '#d5f5e3' : isOpen ? '#D6E0F0' : 'white',
                      }}
                    >
                      <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          background: isSaved ? '#1E8449' : isOpen ? '#1B3A6B' : '#e9ecef',
                          color: isSaved || isOpen ? 'white' : '#adb5bd',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.7rem', fontWeight: 700,
                        }}>
                          {isSaved ? '✓' : isOpen ? '▾' : '▸'}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="fw-bold" style={{
                            fontSize: '0.9rem', color: isSaved ? '#1E8449' : '#1A1A1A',
                          }}>
                            {site.siteName}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            {site.client.clientName} · {site.guardsRequired} required
                          </div>
                        </div>
                      </div>

                      <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
                        {site.firearmsRequired > 0 && (
                          <Badge bg="danger" style={{ fontSize: '0.62rem' }}>🔥 Firearms</Badge>
                        )}
                        {site.armedGuardsRequired > 0 && (
                          <Badge bg="warning" text="dark" style={{ fontSize: '0.62rem' }}>🔫 Armed</Badge>
                        )}
                        {isSaved ? (
                          <>
                            <Badge bg="success" style={{ fontSize: '0.68rem' }}>✅ Done</Badge>
                            <span className="text-muted" style={{ fontSize: '0.74rem' }}>
                              {entry!.savedCount} guard(s)
                            </span>
                          </>
                        ) : entry?.shift ? (
                          <Badge bg="info" text="dark" style={{ fontSize: '0.66rem' }}>
                            {shiftLabel(entry.shift)}
                          </Badge>
                        ) : null}
                        <span style={{ fontSize: '0.72rem', color: isOpen ? '#1B3A6B' : '#6c757d' }}>
                          {isOpen ? 'Click to collapse' : isSaved ? '' : 'Click to assign guards'}
                        </span>
                      </div>
                    </div>

                    {/* Guard assignment — opens inside this same card */}
                    {isOpen && entry && (
                      <div style={{ padding: '16px', background: 'white', borderTop: '1px solid #e9ecef' }}>
                        {/* Shift + date */}
                        <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
                          <div className="d-flex align-items-center gap-2">
                            <span className="text-muted" style={{ fontSize: '0.8rem' }}>🕐 Shift:</span>
                            {shiftFixed ? (
                              <span style={{
                                background: entry.shift ? '#EBF5FB' : '#F2F4F7',
                                color: entry.shift ? '#1B3A6B' : '#adb5bd',
                                borderRadius: '0.375rem', padding: '4px 10px',
                                fontSize: '0.8rem', fontWeight: 600,
                              }}>
                                {entry.shift ? shiftLabel(entry.shift) : 'None on contract'}
                              </span>
                            ) : (
                              <div className="d-flex gap-1">
                                {entry.shiftOptions.map((code) => (
                                  <Button
                                    key={code}
                                    size="sm"
                                    variant={entry.shift === code ? 'primary' : 'outline-secondary'}
                                    onClick={() => patchRoster(site.id, { shift: code, saved: false })}
                                  >
                                    {shiftLabel(code)}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="d-flex align-items-center gap-2">
                            <span className="text-muted" style={{ fontSize: '0.8rem' }}>Date:</span>
                            <input
                              type="date"
                              value={entry.date}
                              onChange={(e) => patchRoster(site.id, { date: e.target.value, saved: false })}
                              style={{
                                padding: '3px 7px', border: '1px solid #ced4da',
                                borderRadius: '0.375rem', fontSize: '0.8rem',
                              }}
                            />
                          </div>

                          <Badge
                            bg={
                              chosen === 0 ? 'secondary'
                              : requiredGuards === 0 ? 'success'
                              : chosen < requiredGuards ? 'warning'
                              : chosen === requiredGuards ? 'success' : 'danger'
                            }
                            text={chosen > 0 && chosen < requiredGuards ? 'dark' : undefined}
                            className="ms-auto"
                          >
                            {requiredGuards > 0 ? `${chosen} / ${requiredGuards}` : `${chosen} selected`}
                          </Badge>
                        </div>

                        {!shiftFixed && !entry.shift && (
                          <Alert variant="warning" className="py-2 small">
                            This site runs more than one shift — choose which one you are rostering.
                          </Alert>
                        )}

                        {entry.savedCount > 0 && (
                          <Alert variant="secondary" className="py-2 small">
                            Already rostered. Adding guards here deploys the new ones; taking a
                            guard off this list does <strong>not</strong> undeploy them — remove
                            them from the{' '}
                            <Link to="/attendance">daily sheet</Link> instead.
                          </Alert>
                        )}

                        {/* Selected guards */}
                        <div className="fw-bold mb-2" style={{ fontSize: '0.85rem', color: '#1B3A6B' }}>
                          Assigned guards
                        </div>
                        {entry.guards.length === 0 ? (
                          <div style={{
                            padding: '18px', textAlign: 'center', color: '#6c757d',
                            fontSize: '0.82rem', background: '#F8F9FA',
                            borderRadius: '0.375rem', marginBottom: '12px',
                          }}>
                            No guards assigned yet — pick from the list below.
                          </div>
                        ) : (
                          <div style={{
                            border: '1px solid #e9ecef', borderRadius: '0.5rem',
                            overflow: 'hidden', marginBottom: '12px',
                          }}>
                            {entry.guards.map((g, i) => (
                              <div
                                key={g.id}
                                className="d-flex align-items-center gap-2"
                                style={{
                                  padding: '7px 12px',
                                  borderBottom: i < entry.guards.length - 1 ? '1px solid #f0f0f0' : 'none',
                                  background: i % 2 === 0 ? 'white' : '#F8F9FA',
                                }}
                              >
                                <span style={{
                                  width: 21, height: 21, borderRadius: '50%', flexShrink: 0,
                                  background: '#1B3A6B', color: 'white', fontWeight: 700,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.68rem',
                                }}>
                                  {i + 1}
                                </span>
                                <InitialsAvatar name={`${g.firstName} ${g.lastName}`} size={26} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.86rem', fontWeight: 500 }}>
                                    {g.firstName} {g.lastName}
                                  </div>
                                  <div className="text-muted" style={{ fontSize: '0.73rem' }}>
                                    {g.rank?.replace(/_/g, ' ') ?? 'Guard'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeGuard(site.id, g.id)}
                                  title={`Remove ${g.firstName} ${g.lastName}`}
                                  style={{
                                    background: 'none', border: 'none', color: '#dc3545',
                                    cursor: 'pointer', fontSize: '1rem', lineHeight: 1, flexShrink: 0,
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {requiredGuards > 0 && (
                          <div className="mb-2" style={{ fontSize: '0.79rem' }}>
                            {chosen > 0 && chosen < requiredGuards && (
                              <span style={{ color: '#856404' }}>
                                ⚠️ {requiredGuards - chosen} more guard(s) needed.
                              </span>
                            )}
                            {chosen === requiredGuards && (
                              <span style={{ color: '#1e8449' }}>✅ Fully staffed.</span>
                            )}
                            {isOverLimit && (
                              <span style={{ color: '#dc3545' }}>
                                ⚠️ {chosen - requiredGuards} over the required number.
                              </span>
                            )}
                          </div>
                        )}

                        {/* Available guards */}
                        <div className="fw-bold mb-2" style={{ fontSize: '0.85rem', color: '#1B3A6B' }}>
                          Available guards
                          <span className="text-muted fw-normal ms-1" style={{ fontSize: '0.78rem' }}>
                            — search and click to add
                          </span>
                        </div>
                        <div style={{ border: '1px solid #ced4da', borderRadius: '0.375rem', overflow: 'hidden' }}>
                          <div style={{ padding: '6px 8px', background: '#f8f9fa', borderBottom: '1px solid #e9ecef' }}>
                            <Form.Control
                              type="text"
                              size="sm"
                              placeholder="Search guards by name…"
                              value={guardSearch}
                              onChange={(e) => setGuardSearch(e.target.value)}
                            />
                          </div>
                          {isAtLimit && (
                            <div style={{
                              padding: '6px 12px', background: '#d5f5e3',
                              borderBottom: '1px solid #a9dfbf', fontSize: '0.79rem',
                              color: '#1e8449', fontWeight: 500,
                            }}>
                              🔒 Limit reached — {requiredGuards} guard(s) selected. Remove one to swap.
                            </div>
                          )}
                          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                            {availableGuards.length === 0 ? (
                              <div className="p-3 text-muted text-center small">
                                {guardSearch ? 'No guards match your search' : 'No guards left to assign'}
                              </div>
                            ) : (
                              availableGuards.map((guard) => {
                                // A pending National ID is shown so the
                                // paperwork can be chased, but it no longer
                                // stops the guard being rostered.
                                const pendingId = guard.pendingNationalId;
                                const disabled = isAtLimit;
                                return (
                                <div
                                  key={guard.id}
                                  role="button"
                                  tabIndex={disabled ? -1 : 0}
                                  onClick={() => addGuard(site.id, guard)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addGuard(site.id, guard); }
                                  }}
                                  title={isAtLimit
                                    ? `Maximum ${requiredGuards} guard(s) already selected`
                                    : pendingId
                                      ? `Add ${guard.firstName} ${guard.lastName} — National ID still outstanding`
                                      : `Add ${guard.firstName} ${guard.lastName}`}
                                  className="d-flex align-items-center gap-2"
                                  style={{
                                    padding: '7px 12px', borderBottom: '1px solid #f0f0f0',
                                    cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none',
                                    opacity: disabled ? 0.35 : 1,
                                    pointerEvents: isAtLimit ? 'none' : 'auto',
                                  }}
                                >
                                  <InitialsAvatar name={guard.fullName} size={26} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                      fontSize: '0.86rem', fontWeight: 500,
                                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                      {guard.firstName} {guard.lastName}
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.73rem' }}>
                                      {guard.rank?.replace(/_/g, ' ') ?? 'Guard'}
                                    </div>
                                  </div>
                                  {pendingId && (
                                    <span
                                      title="National ID still outstanding"
                                      style={{
                                        fontSize: '0.64rem', background: '#F2F4F7', color: '#6c757d',
                                        padding: '1px 5px', borderRadius: 4, flexShrink: 0, fontWeight: 500,
                                      }}
                                    >
                                      No ID
                                    </span>
                                  )}
                                  {guard.alreadyDeployed ? (
                                    <span style={{
                                      fontSize: '0.64rem', background: '#fff3cd', color: '#856404',
                                      padding: '1px 5px', borderRadius: 4, flexShrink: 0, fontWeight: 500,
                                    }}>
                                      ⚠️ Deployed
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.74rem', color: '#0F7B6C', flexShrink: 0 }}>
                                      + Add
                                    </span>
                                  )}
                                </div>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="d-flex align-items-center gap-2 flex-wrap mt-3">
                          <Button
                            variant="primary"
                            size="sm"
                            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                            disabled={createRoster.isPending || entry.guards.length === 0 || !entry.shift}
                            onClick={() => { void saveSite(site); }}
                          >
                            {createRoster.isPending
                              ? <><Spinner size="sm" animation="border" className="me-1" />Saving…</>
                              : `💾 Save ${site.siteName}`}
                          </Button>
                          <Button
                            variant="outline-success"
                            size="sm"
                            disabled={entry.guards.length === 0 || !entry.shift}
                            onClick={() => handleExport(site)}
                          >
                            <i className="bi bi-file-earmark-excel me-1" />Export draft
                          </Button>
                          <Button variant="outline-secondary" size="sm" onClick={() => setOpenSiteId(null)}>
                            Collapse
                          </Button>
                          {nextUnsavedSite(site.id) && (
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-muted text-decoration-none"
                              onClick={() => {
                                const next = nextUnsavedSite(site.id);
                                setOpenSiteId(null);
                                if (next) setTimeout(() => { void openSiteCard(next); }, 150);
                              }}
                            >
                              Skip site →
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Saved summary — collapsed */}
                    {isSaved && !isOpen && entry && (
                      <div style={{
                        padding: '9px 16px', background: '#F0FFF4',
                        borderTop: '1px solid #d5f5e3',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      }}>
                        <div style={{ fontSize: '0.77rem', color: '#1E8449', minWidth: 0 }}>
                          {shiftLabel(entry.shift)} · {entry.date} ·{' '}
                          {entry.guards.map((g) => `${g.firstName} ${g.lastName}`).join(' · ')}
                          {entry.conflicts.length > 0 && (
                            <span style={{ color: '#856404' }}>
                              {' '}· ⚠️ {entry.conflicts.length} skipped as already deployed
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { void openSiteCard(site); }}
                          style={{
                            background: 'none', border: 'none', color: '#1B3A6B',
                            fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Progress / completion */}
              {savedCount > 0 && (
                <div style={{
                  background: '#d5f5e3', border: '2px solid #1E8449',
                  borderRadius: '0.75rem', padding: '14px 18px', marginTop: '18px',
                }}>
                  <div className="fw-bold" style={{ color: '#1E8449' }}>✅ Roster progress</div>
                  <div style={{ fontSize: '0.82rem', color: '#2C3E50' }}>
                    {savedCount} of {zoneSites.length} site(s) rostered for{' '}
                    {new Date(`${rosterDate}T00:00:00`).toLocaleDateString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </div>
                  {allDone && (
                    <div className="fw-bold mt-2" style={{ color: '#1E8449' }}>
                      🎉 Every site in this zone has been rostered.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
