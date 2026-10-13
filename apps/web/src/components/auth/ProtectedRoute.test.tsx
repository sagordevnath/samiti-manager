import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { resetApiProbe } from '@/lib/apiMode';
import { API_URL_OVERRIDE_KEY } from '@/lib/apiConfig';
import { useAuthStore } from '@/stores/auth';

/** Minimal /health body the probe accepts as "this is samity-api". */
function healthOk(mode: 'demo' | 'live') {
  return { ok: true, status: 200, json: async () => ({ status: 'ok', service: 'samity-api', mode }) };
}

function renderGate() {
  return render(
    <MemoryRouter>
      <ProtectedRoute>
        <div>APP CONTENT</div>
      </ProtectedRoute>
    </MemoryRouter>,
  );
}

/**
 * The gate used to render nothing while probing and bounce to a login form
 * that could never succeed when the API was unreachable — indistinguishable
 * from "the app has no data". These tests pin the three outcomes.
 */
describe('ProtectedRoute', () => {
  beforeEach(() => {
    resetApiProbe();
    window.localStorage.clear();
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetApiProbe();
  });

  it('shows an actionable screen when the API cannot be reached', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    renderGate();

    await waitFor(() => expect(screen.getByText('Cannot reach the API server')).toBeInTheDocument());
    // The resolved URL and the reason are both shown, not just a blank page.
    expect(screen.getByText('API base URL:')).toBeInTheDocument();
    expect(screen.getAllByText('/api/v1').length).toBeGreaterThan(0);
    expect(screen.getByText(/ECONNREFUSED/)).toBeInTheDocument();
    // The app must not render behind the failure.
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument();
  });

  it('treats a static host answering with HTML as unreachable, not as data', async () => {
    // A static host rewrites unknown paths to index.html: HTTP 200, no JSON.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    renderGate();

    await waitFor(() => expect(screen.getByText('Cannot reach the API server')).toBeInTheDocument());
    expect(screen.getByText(/did not return JSON/)).toBeInTheDocument();
  });

  it('explains an unreachable API even when a session is already stored', async () => {
    // A persisted token must not short-circuit straight into a shell full of
    // zeros — that is the "deployed but no data" symptom a returning user sees.
    useAuthStore.setState({
      accessToken: 'stale-token',
      refreshToken: 'stale-refresh',
      user: { id: '1', email: 'a@b.test', role: 'super_admin', orgId: null, branchId: null },
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));

    renderGate();

    await waitFor(() => expect(screen.getByText('Cannot reach the API server')).toBeInTheDocument());
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument();
  });

  it('renders the app for a stored session once the API answers', async () => {
    useAuthStore.setState({
      accessToken: 'live-token',
      refreshToken: 'live-refresh',
      user: { id: '1', email: 'a@b.test', role: 'super_admin', orgId: null, branchId: null },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(healthOk('live')));

    renderGate();

    await waitFor(() => expect(screen.getByText('APP CONTENT')).toBeInTheDocument());
  });

  it('seeds the demo session when the API reports demo mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(healthOk('demo')));

    renderGate();

    await waitFor(() => expect(screen.getByText('APP CONTENT')).toBeInTheDocument());
    expect(useAuthStore.getState().accessToken).toBe('demo-token');
  });

  it('never seeds the demo session against a live API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(healthOk('live')));

    renderGate();
    await waitFor(() => expect(screen.queryByText('Cannot reach the API server')).not.toBeInTheDocument());

    // Let the probe settle, then assert the live path did not fabricate a session.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(screen.queryByText('APP CONTENT')).not.toBeInTheDocument();
  });

  it('lets the person looking at the page point this browser at a reachable API', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValue(healthOk('demo'));
    vi.stubGlobal('fetch', fetchMock);

    renderGate();
    await waitFor(() => expect(screen.getByText('Cannot reach the API server')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Use a different API/), 'https://samity-api.onrender.com/api/v1');
    await user.click(screen.getByRole('button', { name: /Test/ }));

    // The next probe uses the typed address, and the repair is remembered in
    // this browser only.
    await waitFor(() => expect(screen.getByText('APP CONTENT')).toBeInTheDocument());
    expect(window.localStorage.getItem(API_URL_OVERRIDE_KEY)).toBe('https://samity-api.onrender.com/api/v1');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://samity-api.onrender.com/api/v1/health');
  });

  it('shows where an active browser override came from, and clears it', async () => {
    window.localStorage.setItem(API_URL_OVERRIDE_KEY, 'https://stale.example.com/api/v1');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));

    renderGate();
    await waitFor(() => expect(screen.getByText('Cannot reach the API server')).toBeInTheDocument());

    // Diagnostics must name the layer that won, or a stale override looks like
    // a broken deployment.
    expect(screen.getByText(/this browser \(localStorage\)/)).toBeInTheDocument();
    expect(screen.getAllByText('https://stale.example.com/api/v1').length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Clear this browser/ }));
    expect(window.localStorage.getItem(API_URL_OVERRIDE_KEY)).toBeNull();
  });
});
