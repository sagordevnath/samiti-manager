import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MemberAdmissionPage } from './MemberAdmissionPage';
import '@/lib/i18n';

describe('MemberAdmissionPage', () => {
  it('shows the onboarding stages and core member fields across the wizard', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MemberAdmissionPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Field survey|মাঠ জরিপ/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Member admission|সদস্য ভর্তি/i).length).toBeGreaterThan(0);

    await user.type(screen.getByLabelText(/Name \(English\)|নাম \(ইংরেজি\)/i), 'Rahima Begum');
    await user.type(screen.getByLabelText(/Name \(Bangla\)|নাম \(বাংলা\)/i), 'রহিমা বেগম');
    await user.type(screen.getByLabelText(/Father \/ husband name|পিতার\/স্বামীর নাম/i), 'Abdul Karim');
    await user.type(screen.getByLabelText(/Mother name|মাতার নাম/i), 'Jahanara Begum');
    await user.type(screen.getByLabelText(/Date of birth|জন্ম তারিখ/i), '1995-03-15');
    await user.type(screen.getByLabelText(/Mobile|মোবাইল/i), '01712345678');
    await user.click(screen.getByRole('button', { name: /Next/i }));

    expect(screen.getByLabelText(/NID or birth registration|এনআইডি বা জন্ম নিবন্ধন/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/NID or birth registration|এনআইডি বা জন্ম নিবন্ধন/i), '1990123456789');
    await user.type(screen.getByLabelText(/Occupation|পেশা/i), 'Poultry farmer');
    await user.type(screen.getByLabelText(/Household income|পরিবারের মাসিক আয়/i), '12000');
    await user.type(screen.getByLabelText(/Land owned|জমির পরিমাণ/i), '15');
    await user.type(screen.getByLabelText(/Family members|পরিবারের সদস্য সংখ্যা/i), '5');
    await user.type(screen.getByLabelText(/Nominee|নমিনি/i), 'Abdul Karim');
    await user.type(screen.getByLabelText(/Share percentage|অংশের হার/i), '100');
    await user.click(screen.getByRole('button', { name: /Next/i }));

    await user.type(screen.getByLabelText(/Address|ঠিকানা/i), 'Village: Baliati, Dhamrai, Dhaka');
    await user.type(screen.getByLabelText(/Photo|ছবি/i), 'uploads/member/photo-001.jpg');
    await user.type(screen.getByLabelText(/Signature|স্বাক্ষর|thumbprint|থাম্বপ্রিন্ট/i), 'uploads/member/signature-001.png');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.click(screen.getByRole('button', { name: /Next/i }));

    expect(screen.getByText(/Member number issued|সদস্য নম্বর দেওয়া হয়েছে/i)).toBeInTheDocument();
  }, 15000);
});
