import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useWebVersion() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('');

  const checkVersion = async () => {
    try {
      const { data } = await supabase
        .from('ops_settings')
        .select('value')
        .eq('key', 'web_version')
        .single();

      if (data?.value) {
        const remoteVersion = data.value;
        const localVersion = localStorage.getItem('webVersion');
        
        setCurrentVersion(remoteVersion);
        
        if (localVersion && localVersion !== remoteVersion) {
          setUpdateAvailable(true);
        } else if (!localVersion) {
          // First run - store current version
          localStorage.setItem('webVersion', remoteVersion);
        }
      }
    } catch (error) {
      console.error('Failed to check web version:', error);
    }
  };

  const handleRefresh = async () => {
    try {
      // Unregister service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg => reg.unregister()));
      }

      // Clear cache storage
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      // Save new version and reload
      localStorage.setItem('webVersion', currentVersion);
      location.reload();
    } catch (error) {
      console.error('Failed to refresh app:', error);
      location.reload(); // Fallback
    }
  };

  useEffect(() => {
    checkVersion();
    
    // Check every 60 seconds
    const interval = setInterval(checkVersion, 60000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    updateAvailable,
    currentVersion,
    handleRefresh,
    dismissUpdate: () => setUpdateAvailable(false)
  };
}