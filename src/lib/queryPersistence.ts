import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import localforage from 'localforage';
import { queryClient } from '@/main';

// Configure localforage for persistence
localforage.config({ name: 'didi-now', storeName: 'rq-cache' });

// Create persister
const persister = createAsyncStoragePersister({ 
  storage: localforage as any 
});

// Initialize persistence with explicit typing
export const initQueryPersistence = async () => {
  try {
    // Cast to any to avoid TS version conflicts
    await (persistQueryClient as any)({
      queryClient,
      persister,
      maxAge: 1000 * 60 * 60, // 1 hour persist TTL
    });
  } catch (error) {
    console.warn('Query persistence initialization failed:', error);
  }
};

// Start persistence after a short delay to avoid startup blocking
setTimeout(initQueryPersistence, 100);