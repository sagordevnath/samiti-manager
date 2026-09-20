import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';
import '@/lib/i18n'; // ensures the initialized instance is registered before render

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  it('renders email and password fields', () => {
    renderPage();
    expect(screen.getByLabelText(/ইমেইল|Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/পাসওয়ার্ড|Password/i)).toBeInTheDocument();
  });

  it('blocks submit with invalid input', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText(/ইমেইল|Email/i), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: /প্রবেশ|Sign in/i }));
    expect(await screen.findByText(/সঠিক ইমেইল|valid email/i)).toBeInTheDocument();
  });
});
