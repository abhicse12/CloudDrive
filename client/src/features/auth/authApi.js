import { baseApi } from '../../services/baseApi.js';

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMe: build.query({
      query: () => ({ url: '/auth/me' }),
      providesTags: ['Me'],
    }),

    login: build.mutation({
      query: (credentials) => ({ url: '/auth/login', method: 'POST', data: credentials }),
    }),

    register: build.mutation({
      query: (account) => ({ url: '/auth/register', method: 'POST', data: account }),
    }),

    logout: build.mutation({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      // Whatever the result, forget all cached data: the next user on this
      // browser must not see the previous user's files.
      onQueryStarted: resetCacheWhenSettled,
    }),

    forgotPassword: build.mutation({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', data: body }),
    }),

    // Resetting a password ends every session on the server, including this browser's;
    // authSlice marks the user as logged out, and the cache is cleared here.
    resetPassword: build.mutation({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', data: body }),
      onQueryStarted: resetCacheWhenSettled,
    }),

    // The response contains the updated user; authSlice stores it, so the new name
    // appears everywhere (sidebar, menu, dashboard) at once.
    updateProfile: build.mutation({
      query: (body) => ({ url: '/auth/me', method: 'PATCH', data: body }),
    }),

    // Keeps this device logged in; the server logs out every OTHER session.
    changePassword: build.mutation({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', data: body }),
    }),
  }),
});

async function resetCacheWhenSettled(_arg, { dispatch, queryFulfilled }) {
  try {
    await queryFulfilled;
  } catch {
    // Failure is handled by the component / authSlice; nothing to do here.
  }
  dispatch(baseApi.util.resetApiState());
}

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useUpdateProfileMutation,
  useChangePasswordMutation,
} = authApi;
