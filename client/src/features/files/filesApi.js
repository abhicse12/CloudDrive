import { baseApi } from '../../services/baseApi.js';
import { INVALIDATES } from './cacheTags.js';

export const FILES_PAGE_SIZE = 50;

/** "Load more": ask for the next page until the server says there are no more. */
const nextPage = (lastPage) =>
  lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined;

export const filesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // ─── Files ───

    /**
     * Files in a folder, or search results. An INFINITE query: each "Load more" fetches
     * the next page and RTK Query keeps all pages together in `data.pages`.
     * arg: { folderId?, q?, category?, sortBy?, sortOrder? }
     */
    getFiles: build.infiniteQuery({
      infiniteQueryOptions: { initialPageParam: 1, getNextPageParam: nextPage },
      query: ({ queryArg, pageParam }) => ({
        url: '/files',
        params: { ...queryArg, page: pageParam, pageSize: FILES_PAGE_SIZE },
      }),
      providesTags: ['File'],
    }),

    getFile: build.query({
      query: (id) => ({ url: `/files/${id}` }),
      providesTags: ['File'],
    }),

    /**
     * A signed link for previewing: { url, disposition, expiresAt }. Links expire after
     * a few minutes, so cached ones are dropped quickly and every opening fetches anew.
     * `disposition` in the answer may be 'attachment' if the type can't be shown.
     */
    getPreviewLink: build.query({
      query: (id) => ({ url: `/files/${id}/download`, params: { disposition: 'inline' } }),
      keepUnusedDataFor: 30,
    }),

    updateFile: build.mutation({
      query: ({ id, ...changes }) => ({ url: `/files/${id}`, method: 'PATCH', data: changes }),
      invalidatesTags: INVALIDATES.fileEdited,
    }),

    trashFile: build.mutation({
      query: (id) => ({ url: `/files/${id}`, method: 'DELETE' }),
      invalidatesTags: INVALIDATES.trashChanged,
    }),

    restoreFile: build.mutation({
      query: (id) => ({ url: `/files/${id}/restore`, method: 'POST' }),
      invalidatesTags: INVALIDATES.trashChanged,
    }),

    deleteFileForever: build.mutation({
      query: (id) => ({ url: `/files/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: INVALIDATES.deletedForever,
    }),

    /** { action: 'trash' | 'restore' | 'move' | 'delete', ids, folderId? } → { affected } */
    bulkFiles: build.mutation({
      query: (body) => ({ url: '/files/bulk', method: 'POST', data: body }),
      invalidatesTags: (_result, _error, { action }) =>
        action === 'delete' ? INVALIDATES.deletedForever : INVALIDATES.trashChanged,
    }),

    // ─── Folders ───

    /** Subfolders of a folder (no parentId = root). arg: { parentId?, sortBy?, sortOrder? } */
    getFolders: build.query({
      query: (params = {}) => ({ url: '/folders', params }),
      providesTags: ['Folder'],
    }),

    /** { folder, breadcrumbs } */
    getFolder: build.query({
      query: (id) => ({ url: `/folders/${id}` }),
      providesTags: ['Folder'],
    }),

    /** Every folder, flat: the "Move to…" picker builds the tree from parentId. */
    getFolderTree: build.query({
      query: () => ({ url: '/folders/tree' }),
      providesTags: ['Folder'],
    }),

    createFolder: build.mutation({
      query: (body) => ({ url: '/folders', method: 'POST', data: body }),
      invalidatesTags: INVALIDATES.folderCreated,
    }),

    updateFolder: build.mutation({
      query: ({ id, ...changes }) => ({ url: `/folders/${id}`, method: 'PATCH', data: changes }),
      invalidatesTags: INVALIDATES.folderEdited,
    }),

    trashFolder: build.mutation({
      query: (id) => ({ url: `/folders/${id}`, method: 'DELETE' }),
      invalidatesTags: INVALIDATES.trashChanged,
    }),

    restoreFolder: build.mutation({
      query: (id) => ({ url: `/folders/${id}/restore`, method: 'POST' }),
      invalidatesTags: INVALIDATES.trashChanged,
    }),

    deleteFolderForever: build.mutation({
      query: (id) => ({ url: `/folders/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: INVALIDATES.deletedForever,
    }),
  }),
});

export const {
  useGetFilesInfiniteQuery,
  useGetFileQuery,
  useGetPreviewLinkQuery,
  useUpdateFileMutation,
  useTrashFileMutation,
  useRestoreFileMutation,
  useDeleteFileForeverMutation,
  useBulkFilesMutation,
  useGetFoldersQuery,
  useGetFolderQuery,
  useGetFolderTreeQuery,
  useCreateFolderMutation,
  useUpdateFolderMutation,
  useTrashFolderMutation,
  useRestoreFolderMutation,
  useDeleteFolderForeverMutation,
} = filesApi;
