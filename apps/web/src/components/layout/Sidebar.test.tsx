import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import i18n from '@/lib/i18n'; // eslint-disable-line @typescript-eslint/no-unused-vars — registers instance before render

// Pin Bangla so text assertions are deterministic regardless of detector order.
i18n.language = 'bn';

describe('Sidebar permissions', () => {
  it('hides admin items from branch_manager', () => {
    useAuthStore.setState({
      accessToken: 'x',
      user: { id: '1', email: 'm@t.test', role: 'branch_manager', orgId: null, branchId: null },
    });
    useUiStore.setState({ sidebarOpen: false });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    // visible for branch_manager (member:read)
    expect(screen.getByText('সদস্য')).toBeInTheDocument();
    // hidden (user:manage)
    expect(screen.queryByText('ব্যবহারকারী')).not.toBeInTheDocument();
  });

  it('shows everything for super_admin', () => {
    useAuthStore.setState({
      accessToken: 'x',
      user: { id: '1', email: 'a@t.test', role: 'super_admin', orgId: null, branchId: null },
    });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText('ব্যবহারকারী')).toBeInTheDocument();
    expect(screen.getByText('রিপোর্ট')).toBeInTheDocument();
  });
});
