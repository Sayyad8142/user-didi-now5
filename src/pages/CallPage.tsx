import React from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { CallScreen } from '@/components/calling/CallScreen';

export default function CallPage() {
  const location = useLocation();
  const state = location.state as any;

  if (!state || !state.rtcCallId || !state.roomUrl || !state.token) {
    return <Navigate to="/" replace />;
  }

  return (
    <CallScreen
      rtcCallId={state.rtcCallId}
      roomUrl={state.roomUrl}
      token={state.token}
      callerName={state.callerName}
      initialState={state.initialState}
    />
  );
}
