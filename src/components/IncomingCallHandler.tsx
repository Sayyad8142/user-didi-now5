import React from 'react';
import { IncomingCallScreen } from './calling/IncomingCallScreen';
import { useIncomingRtcPush } from '@/hooks/useIncomingRtcPush';

export const IncomingCallHandler: React.FC = () => {
  const { incomingCall, clearIncomingCall } = useIncomingRtcPush();

  console.log('📞 IncomingCallHandler render - incomingCall:', incomingCall);

  if (!incomingCall) {
    console.log('📞 No incoming call, returning null');
    return null;
  }

  console.log('📞 Rendering IncomingCallScreen for call:', incomingCall.rtc_call_id);

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50">
      <IncomingCallScreen
        rtcCallId={incomingCall.rtc_call_id}
        callerName={incomingCall.caller_name || 'Someone'}
        onDismiss={clearIncomingCall}
      />
    </div>
  );
};
