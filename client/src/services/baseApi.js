import { createApi } from '@reduxjs/toolkit/query/react';
import { apiClient, toApiError } from './apiClient.js';

/**
 * Adapter that lets RTK Query send its requests through our axios client, so every
 * RTK Query call gets CSRF headers and silent refresh for free.
 * Unwraps our { success, data } envelope: components receive `data` directly.
 */
function axiosBaseQuery() {
  return async ({ url, method = 'GET', data, params }) => {
    try {
      const response = await apiClient({ url, method, data, params });
      const body = response.data;
      // Paginated lists also send `meta` ({ page, totalPages, ... }) next to `data`.
      // Keep it: "Load more" needs to know whether there is a next page.
      if (body?.meta && body.data && typeof body.data === 'object') {
        return { data: { ...body.data, meta: body.meta } };
      }
      return { data: body?.data ?? null }; // 204 No Content → null
    } catch (error) {
      return { error: toApiError(error) };
    }
  };
}

/**
 * The single RTK Query API. Feature folders add their endpoints with
 * baseApi.injectEndpoints(...), so each feature keeps its own API code.
 * `tagTypes` drive automatic refetching: a mutation that "invalidates" a tag makes
 * every query that "provides" it refetch (e.g. upload a file → file list updates).
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  // File/Folder: browsing lists. Trash: the trash page. Stats: storage numbers.
  // Activity: the dashboard feed. See features/files/cacheTags.js for who refreshes what.
  tagTypes: ['Me', 'File', 'Folder', 'Trash', 'Stats', 'Activity'],
  endpoints: () => ({}),
});
