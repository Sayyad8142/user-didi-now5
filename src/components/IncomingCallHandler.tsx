import React from 'react';
import { IncomingCallScreen } from './calling/IncomingCallScreen';
import { useIncomingRtcPush } from '@/hooks/useIncomingRtcPush';

export const IncomingCallHandler: React.FC = () => {
  const { incomingCall, clearIncomingCall } = useIncomingRtcPush();

  if (!incomingCall) return null;

  return (
    <IncomingCallScreen
      rtcCallId={incomingCall.rtc_call_id}
      callerName={incomingCall.caller_name || 'Someone'}
      onDismiss={clearIncomingCall}
    />
  );
};
