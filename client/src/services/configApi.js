import { baseApi } from './baseApi.js';

// Fallbacks match the server defaults, used only until /config has loaded.
export const DEFAULT_CONFIG = {
  maxFileSizeBytes: 100 * 1024 * 1024,
  maxFilesPerUpload: 20,
  trashRetentionDays: 30,
};

export const configApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Server limits (max file size...). They rarely change, so cache them for an hour. */
    getConfig: build.query({
      query: () => ({ url: '/config' }),
      keepUnusedDataFor: 3600,
    }),
  }),
});

export const { useGetConfigQuery } = configApi;

/** Current limits from the cache (for non-component code such as the upload queue). */
export const selectConfig = (state) =>
  configApi.endpoints.getConfig.select()(state).data ?? DEFAULT_CONFIG;
