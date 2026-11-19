import { baseApi } from '../../services/baseApi.js';

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** storageUsed/Limit, remaining, percentUsed, counts, byCategory, trashBytes */
    getStats: build.query({
      query: () => ({ url: '/dashboard/stats' }),
      providesTags: ['Stats'],
    }),

    getRecentFiles: build.query({
      query: (limit = 8) => ({ url: '/dashboard/recent-files', params: { limit } }),
      providesTags: ['File'],
    }),

    /** Cursor-paged: each page returns nextCursor (null on the last page). */
    getActivity: build.infiniteQuery({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
      query: ({ pageParam }) => ({
        url: '/dashboard/activity',
        params: { limit: 10, ...(pageParam && { cursor: pageParam }) },
      }),
      providesTags: ['Activity'],
    }),
  }),
});

export const { useGetStatsQuery, useGetRecentFilesQuery, useGetActivityInfiniteQuery } =
  dashboardApi;
