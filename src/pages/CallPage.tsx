import React from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { CallScreen } from '@/components/calling/CallScreen';

export default function CallPage() {
  const location = useLocation();
  const state = location.state as any;

  if (!state || !state.rtcCallId || !state.roomId || !state.token) {
    return <Navigate to="/" replace />;
  }

  return (
    <CallScreen
      rtcCallId={state.rtcCallId}
      roomId={state.roomId}
      roomUrl={state.roomUrl}
      token={state.token}
      callerName={state.callerName}
      initialState={state.initialState}
    />
  );
}
