// src/components/PushNotificationProvider.tsx
import React, { ReactNode, useEffect, useRef } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "@/components/ui/sonner";

interface Props {
  children: ReactNode;
}

export const PushNotificationProvider: React.FC<Props> = ({ children }) => {
  const { profile, loading } = useProfile();
  const userId = !loading ? profile?.id ?? null : null;

  const { isRegistered, lastError } = usePushNotifications({ userId });

  const lastToastRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastError && lastToastRef.current !== lastError) {
      lastToastRef.current = lastError;
      toast.error(lastError);
    }
  }, [lastError]);

  useEffect(() => {
    if (isRegistered && lastToastRef.current !== "registered") {
      lastToastRef.current = "registered";
      toast.success("Push notifications enabled");
    }
  }, [isRegistered]);

  return <>{children}</>;
};
