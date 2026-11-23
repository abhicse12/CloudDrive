import { baseApi } from '../../services/baseApi.js';
import { INVALIDATES } from '../files/cacheTags.js';

export const ADMIN_USERS_PAGE_SIZE = 20;

/*
 * Admin endpoints. Hiding the admin page from normal users is only for their
 * convenience: the API itself answers 403 to anyone who isn't an ADMIN.
 */
export const adminApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** { users, files, storage, activeShares, signups: { days, total }, byCategory, topUsers } */
    getAdminStats: build.query({
      query: () => ({ url: '/admin/stats' }),
      providesTags: ['AdminStats'],
    }),

    /**
     * One numbered page of the users table (not "Load more": admins jump between pages).
     * arg: { q?, role?, status?, sortBy?, sortOrder?, page? } → { users, meta }
     */
    getAdminUsers: build.query({
      query: ({ page = 1, ...filters } = {}) => ({
        url: '/admin/users',
        params: { ...filters, page, pageSize: ADMIN_USERS_PAGE_SIZE },
      }),
      providesTags: ['AdminUsers'],
    }),

    /**
     * { id, role?, status?, storageLimit? } → { user }. 409 codes the UI explains:
     * CANNOT_CHANGE_OWN_ACCESS, LAST_ADMIN, LIMIT_BELOW_USAGE.
     */
    updateAdminUser: build.mutation({
      query: ({ id, ...changes }) => ({
        url: `/admin/users/${id}`,
        method: 'PATCH',
        data: changes,
      }),
      invalidatesTags: INVALIDATES.adminUserChanged,
    }),
  }),
});

export const { useGetAdminStatsQuery, useGetAdminUsersQuery, useUpdateAdminUserMutation } =
  adminApi;
