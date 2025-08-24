import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export const useBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only handle back button on mobile platforms
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handleBackButton = () => {
      // Define routes where back button should exit the app
      const exitRoutes = ['/', '/home'];
      
      // If we're on a main screen, exit the app
      if (exitRoutes.includes(location.pathname)) {
        App.exitApp();
        return;
      }

      // For auth flow, handle differently
      if (location.pathname === '/auth' || location.pathname === '/auth/verify') {
        // Go back to home or exit if no history
        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate('/');
        }
        return;
      }

      // For admin routes, go back within admin or to home
      if (location.pathname.startsWith('/admin')) {
        if (location.pathname === '/admin' || location.pathname === '/admin/') {
          navigate('/home');
        } else {
          navigate(-1);
        }
        return;
      }

      // For all other routes, navigate back
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/home');
      }
    };

    // Add the back button listener
    let listenerHandle: any;
    
    App.addListener('backButton', handleBackButton).then((handle) => {
      listenerHandle = handle;
    });

    // Cleanup
    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [navigate, location.pathname]);
};