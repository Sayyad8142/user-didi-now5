// Isolated browser fixture, not registered as an application route.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../src/components/ui/button';
import { BookingOtpDisplay } from '../src/features/bookings/BookingOtpDisplay';
import { parseOtpResponse, resolveVisibleOtp } from '../src/features/bookings/otpContract';
import '../src/index.css';

function Harness() {
  const [scenario, setScenario] = useState('Pending');
  const [gated, setGated] = useState(false);
  const status = scenario === 'Pending' || scenario === 'Reassigned' ? 'pending' : scenario === 'Started' ? 'started' : scenario === 'Completed' ? 'completed' : scenario === 'Cancelled' ? 'cancelled' : 'assigned';
  const response = scenario === 'Legacy'
    ? parseOtpResponse({ otp_mode: 'legacy', available: false, reason: 'LEGACY_BOOKING' })
    : scenario === 'Unavailable'
      ? parseOtpResponse({ otp_mode: 'v2', available: false, reason: 'CREDENTIALS_NOT_READY' })
      : parseOtpResponse({ otp_mode: 'v2', available: true, otp_type: scenario === 'Started' ? 'completion' : 'start', otp: scenario === 'Started' ? '0567' : '0123', assignment_generation: 2 });
  const value = resolveVisibleOtp({ id: 'mock', status, completion_otp: '123', payment_status: 'paid' }, response, true);
  return <main className="mx-auto max-w-md p-4 bg-background text-foreground">
    <nav className="flex flex-wrap gap-2">{['Pending', 'Assigned', 'Started', 'Reassigned', 'Completed', 'Cancelled', 'Unavailable', 'Legacy'].map(name => <Button key={name} variant="outline" onClick={() => setScenario(name)}>{name}</Button>)}
      <Button variant="outline" onClick={() => setGated(v => !v)}>Rating gate</Button>
    </nav>
    <BookingOtpDisplay value={value} gated={gated} onReveal={() => setGated(false)} />
  </main>;
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Harness />);