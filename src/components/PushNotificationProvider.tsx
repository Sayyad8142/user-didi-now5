// src/components/PushNotificationProvider.tsx
import React, { ReactNode } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface Props {
  children: ReactNode;
}

export const PushNotificationProvider: React.FC<Props> = ({ children }) => {
  const { profile, loading } = useProfile();
  const userId = !loading ? profile?.id ?? null : null;

  usePushNotifications({ userId });

  return <>{children}</>;
};
