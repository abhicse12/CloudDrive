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
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(baseApi.util.resetApiState());
        }
      },
    }),
  }),
});

export const { useLoginMutation, useRegisterMutation, useLogoutMutation } = authApi;
