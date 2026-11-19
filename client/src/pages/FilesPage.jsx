import { FolderOpen, FolderX, SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { Breadcrumbs } from '../components/files/Breadcrumbs.jsx';
import { FileGrid, FileTable } from '../components/files/FileViews.jsx';
import { FolderCard } from '../components/files/FolderCard.jsx';
import { CATEGORIES } from '../components/files/fileCategories.js';
import { Button, ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { FilesToolbar } from '../features/files/FilesToolbar.jsx';
import {
  useGetFilesInfiniteQuery,
  useGetFolderQuery,
  useGetFoldersQuery,
} from '../features/files/filesApi.js';
import { useBrowseParams } from '../features/files/useBrowseParams.js';
import { useViewMode } from '../features/files/useViewMode.js';

/** /app/files and /app/files/:folderId: browse folders, search and filter files. */
export function FilesPage() {
  const [params, updateParams] = useBrowseParams();
  const [viewMode, setViewMode] = useViewMode();
  const { folderId, q, category, sortBy, sortOrder } = params;
  const searching = q !== '';

  const folder = useGetFolderQuery(folderId, { skip: !folderId });

  // Search covers files only, and a type filter ("Images") has no folders to show.
  const showFolders = !searching && !category;
  const folders = useGetFoldersQuery(
    {
      ...(folderId && { parentId: folderId }),
      // Folders have no size: fall back to name when files are sorted by size.
      sortBy: sortBy === 'size' ? 'name' : sortBy,
      sortOrder,
    },
    { skip: !showFolders },
  );

  const files = useGetFilesInfiniteQuery({
    ...(folderId && { folderId }),
    ...(searching && { q }),
    ...(category && { category }),
    sortBy,
    sortOrder,
  });

  // 404 = doesn't exist / not yours / in trash. 400 = not even a valid ID.
  if (folder.error && [400, 404].includes(folder.error.status)) {
    return (
      <div className="mx-auto max-w-6xl">
        <title>Folder not found · CloudDrive</title>
        <EmptyState
          Icon={FolderX}
          title="Folder not found"
          description="It may have been moved to the trash, or the link is wrong."
          action={<ButtonLink to="/app/files">Back to My Files</ButtonLink>}
        />
      </div>
    );
  }

  const fileList = files.data?.pages.flatMap((page) => page.files) ?? [];
  const totalFiles = files.data?.pages[0]?.meta.total ?? 0;
  const folderList = showFolders ? (folders.data?.folders ?? []) : [];
  const loading = files.isLoading || (showFolders && folders.isLoading);
  const failed = files.error ?? (showFolders ? folders.error : undefined);
  const title = searching ? `Results for “${q}”` : (folder.data?.folder.name ?? 'My Files');

  return (
    <div className="mx-auto max-w-6xl">
      <title>{`${title} · CloudDrive`}</title>

      <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
        {searching ? (
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
            <Link to="/app/files" className="shrink-0 text-sm text-brand-600 hover:underline">
              Clear search
            </Link>
          </div>
        ) : folderId && folder.isLoading ? (
          <Skeleton className="h-5 w-48" />
        ) : (
          <>
            <h1 className="sr-only">{title}</h1>
            <Breadcrumbs crumbs={folder.data?.breadcrumbs} />
          </>
        )}
      </div>

      <div className="mt-4">
        <FilesToolbar
          params={params}
          onChange={updateParams}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>

      <div className="mt-6 space-y-8">
        {loading ? (
          <LoadingState viewMode={viewMode} />
        ) : failed ? (
          <ErrorState
            title="Couldn't load your files"
            error={failed}
            onRetry={() => {
              files.refetch();
              if (showFolders) folders.refetch();
            }}
          />
        ) : folderList.length === 0 && fileList.length === 0 ? (
          <NothingHere searching={searching} q={q} category={category} />
        ) : (
          <>
            {folderList.length > 0 && (
              <section aria-labelledby="folders-heading">
                <h2 id="folders-heading" className="mb-3 text-sm font-medium text-fg-muted">
                  Folders
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {folderList.map((item) => (
                    <li key={item.id} className="min-w-0">
                      <FolderCard folder={item} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {fileList.length > 0 && (
              <section aria-labelledby="files-heading">
                <h2 id="files-heading" className="mb-3 text-sm font-medium text-fg-muted">
                  Files
                </h2>
                {viewMode === 'list' ? (
                  <FileTable files={fileList} />
                ) : (
                  <FileGrid files={fileList} />
                )}

                <div className="mt-6 flex flex-col items-center gap-2">
                  <p className="text-xs text-fg-subtle">
                    Showing {fileList.length} of {totalFiles} files
                  </p>
                  {files.hasNextPage && (
                    <Button
                      variant="secondary"
                      onClick={() => files.fetchNextPage()}
                      loading={files.isFetchingNextPage}
                    >
                      Load more
                    </Button>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NothingHere({ searching, q, category }) {
  if (searching) {
    return (
      <EmptyState
        Icon={SearchX}
        title={`No files match “${q}”`}
        description="Try a different word, or check the spelling."
      />
    );
  }
  if (category) {
    return (
      <EmptyState
        Icon={FolderOpen}
        title={`No ${CATEGORIES[category].label.toLowerCase()} here`}
        description="Choose “All” to see every file in this folder."
      />
    );
  }
  return (
    <EmptyState
      Icon={FolderOpen}
      title="This folder is empty"
      description="Files and folders you add will appear here."
    />
  );
}

function LoadingState({ viewMode }) {
  return (
    <div aria-busy="true" aria-label="Loading files">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: viewMode === 'list' ? 0 : 10 }, (_, i) => (
          <Skeleton key={i} className="aspect-[4/4] rounded-2xl" />
        ))}
      </div>
      {viewMode === 'list' &&
        Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mb-2 h-11" />)}
    </div>
  );
}
