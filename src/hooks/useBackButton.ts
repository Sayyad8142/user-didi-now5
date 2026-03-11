import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export const useBackButton = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handleBackButton = () => {
      const exitRoutes = ['/', '/home'];
      
      if (exitRoutes.includes(location.pathname)) {
        App.exitApp();
        return;
      }

      if (location.pathname === '/auth' || location.pathname === '/auth/verify') {
        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate('/');
        }
        return;
      }

      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/home');
      }
    };

    let listenerHandle: any;
    
    App.addListener('backButton', handleBackButton).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [navigate, location.pathname]);
};
