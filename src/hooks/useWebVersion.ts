import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useWebVersion() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [updateMode, setUpdateMode] = useState<'soft' | 'force'>('soft');

  const checkVersion = async () => {
    try {
      // Fetch both version and update mode
      const { data } = await supabase
        .from('ops_settings')
        .select('key, value')
        .in('key', ['web_version', 'web_update_mode']);

      if (data) {
        const versionRow = data.find(row => row.key === 'web_version');
        const modeRow = data.find(row => row.key === 'web_update_mode');
        
        const remoteVersion = versionRow?.value || '1.0.0';
        const remoteMode = (modeRow?.value as 'soft' | 'force') || 'soft';
        
        setCurrentVersion(remoteVersion);
        setUpdateMode(remoteMode);
        
        const localVersion = localStorage.getItem('webVersion');
        
        if (localVersion && localVersion !== remoteVersion) {
          if (remoteMode === 'force') {
            // Force update - skip banner and reload immediately
            await handleRefresh();
            return;
          } else {
            // Soft update - show banner
            setUpdateAvailable(true);
          }
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
    updateMode,
    handleRefresh,
    dismissUpdate: () => setUpdateAvailable(false)
  };
}