import { configureStore } from '@reduxjs/toolkit';
import { authApi } from '../features/auth/authApi.js';
import { authReducer, sessionExpired } from '../features/auth/authSlice.js';
import { uploadsListener } from '../features/uploads/uploadQueue.js';
import { uploadsReducer } from '../features/uploads/uploadSlice.js';
import { setForbiddenHandler, setSessionExpiredHandler } from '../services/apiClient.js';
import { baseApi } from '../services/baseApi.js';

/** Creates a store. A function (not a singleton) so tests can build fresh ones. */
export function createStore(preloadedState) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      uploads: uploadsReducer,
      [baseApi.reducerPath]: baseApi.reducer, // RTK Query's cache
    },
    // RTK Query's middleware handles caching, refetching and cache lifetimes; the
    // uploads listener aborts running uploads when the session ends.
    middleware: (getDefault) =>
      getDefault().prepend(uploadsListener.middleware).concat(baseApi.middleware),
    preloadedState,
  });

  // When the API client finds the session is gone: mark the user as logged out and
  // drop every cached response, so no previous user's data stays in memory.
  setSessionExpiredHandler(() => {
    store.dispatch(sessionExpired());
    store.dispatch(baseApi.util.resetApiState());
  });

  // A 403 means our idea of the user's role is out of date: ask the server again.
  // (Parallel 403s share one request: RTK Query dedupes identical requests in flight.)
  setForbiddenHandler(() => {
    store.dispatch(
      authApi.endpoints.getMe.initiate(undefined, { forceRefetch: true, subscribe: false }),
    );
  });

  return store;
}
