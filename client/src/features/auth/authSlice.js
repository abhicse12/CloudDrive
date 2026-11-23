import { createSlice, isAnyOf } from '@reduxjs/toolkit';
import { authApi } from './authApi.js';

/**
 * Who is logged in. `status` answers the question every guard asks:
 *   'unknown'       app just opened, still asking the server (/auth/me)
 *   'authenticated' logged in, `user` is set
 *   'guest'         not logged in
 * 'unknown' matters: without it, a logged-in user refreshing /app would be bounced to
 * /login for a split second, before /auth/me had a chance to answer.
 */
const initialState = { user: null, status: 'unknown' };

function setUser(state, { payload }) {
  state.user = payload.user;
  state.status = 'authenticated';
}

function clearUser(state) {
  state.user = null;
  state.status = 'guest';
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Dispatched by the API client when a silent refresh fails.
    sessionExpired: clearUser,
  },
  // React to API results instead of duplicating that logic in every component.
  extraReducers: (builder) => {
    builder
      .addMatcher(authApi.endpoints.getMe.matchFulfilled, setUser)
      .addMatcher(authApi.endpoints.getMe.matchRejected, (state, action) => {
        // "condition" rejections mean "skipped, already cached" - not a failure.
        if (!action.meta.condition) clearUser(state);
      })
      .addMatcher(authApi.endpoints.login.matchFulfilled, setUser)
      .addMatcher(authApi.endpoints.register.matchFulfilled, setUser)
      .addMatcher(authApi.endpoints.updateProfile.matchFulfilled, setUser)
      // Logged out locally even if the network call failed: never leave the user
      // looking logged in after pressing "Log out".
      .addMatcher(authApi.endpoints.logout.matchFulfilled, clearUser)
      .addMatcher(authApi.endpoints.logout.matchRejected, clearUser)
      // A successful reset ends ALL sessions on the server, so this browser too.
      .addMatcher(authApi.endpoints.resetPassword.matchFulfilled, clearUser);
  },
});

export const { sessionExpired } = authSlice.actions;
export const authReducer = authSlice.reducer;

/**
 * Every way this browser stops being logged in. Other slices (uploads) listen to it to
 * forget the previous user's state, so the next person here never sees it.
 */
export const sessionEnded = isAnyOf(
  sessionExpired,
  authApi.endpoints.logout.matchFulfilled,
  authApi.endpoints.logout.matchRejected,
  authApi.endpoints.resetPassword.matchFulfilled,
);

export const selectCurrentUser = (state) => state.auth.user;
export const selectAuthStatus = (state) => state.auth.status;
