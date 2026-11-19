import { baseApi } from '../../services/baseApi.js';
import { INVALIDATES } from '../files/cacheTags.js';

const nextPage = (lastPage) =>
  lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined;

export const trashApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * Each page: { folders, files, retentionDays, meta }. Files are paginated; the
     * (few) trashed folders come in full with every page, so use the first page's.
     */
    getTrash: build.infiniteQuery({
      infiniteQueryOptions: { initialPageParam: 1, getNextPageParam: nextPage },
      query: ({ pageParam }) => ({ url: '/trash', params: { page: pageParam, pageSize: 50 } }),
      providesTags: ['Trash'],
    }),

    emptyTrash: build.mutation({
      query: () => ({ url: '/trash', method: 'DELETE' }),
      invalidatesTags: INVALIDATES.deletedForever,
    }),
  }),
});

export const { useGetTrashInfiniteQuery, useEmptyTrashMutation } = trashApi;
