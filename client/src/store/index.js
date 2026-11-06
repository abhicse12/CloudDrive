import { configureStore } from '@reduxjs/toolkit';
import { authReducer, sessionExpired } from '../features/auth/authSlice.js';
import { setSessionExpiredHandler } from '../services/apiClient.js';
import { baseApi } from '../services/baseApi.js';

/** Creates a store. A function (not a singleton) so tests can build fresh ones. */
export function createStore(preloadedState) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer, // RTK Query's cache
    },
    // RTK Query's middleware handles caching, refetching and cache lifetimes.
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
    preloadedState,
  });

  // When the API client finds the session is gone: mark the user as logged out and
  // drop every cached response, so no previous user's data stays in memory.
  setSessionExpiredHandler(() => {
    store.dispatch(sessionExpired());
    store.dispatch(baseApi.util.resetApiState());
  });

  return store;
}
