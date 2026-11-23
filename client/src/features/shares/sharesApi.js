import { baseApi } from '../../services/baseApi.js';
import { INVALIDATES } from '../files/cacheTags.js';

export const SHARES_PAGE_SIZE = 50;

/** Presets the API accepts, in the order the share dialog offers them. */
export const SHARE_EXPIRY_OPTIONS = [
  { value: '1h', label: '1 hour' },
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never' },
];
export const DEFAULT_SHARE_EXPIRY = '7d';

const nextPage = (lastPage) =>
  lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined;

export const sharesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** My share links, newest first. arg: { status?: 'active' | 'expired' | 'revoked' } */
    getShares: build.infiniteQuery({
      infiniteQueryOptions: { initialPageParam: 1, getNextPageParam: nextPage },
      query: ({ queryArg, pageParam }) => ({
        url: '/shares',
        params: { ...queryArg, page: pageParam, pageSize: SHARES_PAGE_SIZE },
      }),
      providesTags: ['Share'],
    }),

    /**
     * → { share, url }. The url holds the token and is returned ONLY here (and by
     * regenerate): the dialog must show it now, it can't be fetched again later.
     */
    createShare: build.mutation({
      query: ({ fileId, expiresIn }) => ({
        url: `/files/${fileId}/share`,
        method: 'POST',
        data: { expiresIn },
      }),
      invalidatesTags: INVALIDATES.shareChanged,
    }),

    revokeShare: build.mutation({
      query: (id) => ({ url: `/shares/${id}`, method: 'DELETE' }),
      invalidatesTags: INVALIDATES.shareChanged,
    }),

    /** → { share, url }: a new link with the same expiry; the old one stops working. */
    regenerateShare: build.mutation({
      query: (id) => ({ url: `/shares/${id}/regenerate`, method: 'POST' }),
      invalidatesTags: INVALIDATES.shareChanged,
    }),

    /**
     * The public page's file info (no login). Not tagged: nothing in this browser can
     * change it, and a visitor only looks once. Errors are always a plain 404.
     */
    getPublicShare: build.query({
      query: (token) => ({ url: `/public/shares/${encodeURIComponent(token)}` }),
    }),
  }),
});

/** Plain link for the public download (a 302 to the file): works in an <a href>. */
export const publicDownloadUrl = (token, { inline = false } = {}) =>
  `/api/public/shares/${encodeURIComponent(token)}/download${inline ? '?disposition=inline' : ''}`;

export const {
  useGetSharesInfiniteQuery,
  useCreateShareMutation,
  useRevokeShareMutation,
  useRegenerateShareMutation,
  useGetPublicShareQuery,
} = sharesApi;
