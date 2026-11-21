import { FolderOpen, FolderPlus, FolderX, Plus, SearchX, Upload } from 'lucide-react';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Link } from 'react-router';
import { Breadcrumbs } from '../components/files/Breadcrumbs.jsx';
import { CATEGORIES } from '../components/files/fileCategories.js';
import { Button, ButtonLink } from '../components/ui/Button.jsx';
import { buttonClasses } from '../components/ui/buttonClasses.js';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States.jsx';
import { FileBrowser } from '../features/files/FileBrowser.jsx';
import { FilesToolbar } from '../features/files/FilesToolbar.jsx';
import { NewFolderDialog } from '../features/files/NewFolderDialog.jsx';
import {
  useGetFilesInfiniteQuery,
  useGetFolderQuery,
  useGetFoldersQuery,
} from '../features/files/filesApi.js';
import { useBrowseParams } from '../features/files/useBrowseParams.js';
import { useViewMode } from '../features/files/useViewMode.js';
import { DropOverlay } from '../features/uploads/DropOverlay.jsx';
import { startUploads } from '../features/uploads/uploadQueue.js';
import { dialogOpened } from '../features/uploads/uploadSlice.js';

/** /app/files and /app/files/:folderId: browse folders, search and filter files. */
export function FilesPage() {
  const [params, updateParams] = useBrowseParams();
  const [viewMode, setViewMode] = useViewMode();
  const { folderId, q, category, sortBy, sortOrder } = params;
  const searching = q !== '';
  const dispatch = useDispatch();
  const [newFolderOpen, setNewFolderOpen] = useState(false);

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
  // Uploads and new folders go into the folder being viewed.
  const target = { folderId, folderName: folder.data?.folder.name ?? 'My Files' };
  const openUploadDialog = () => dispatch(dialogOpened(target));
  const uploadDropped = (dropped) => {
    dispatch(dialogOpened(target));
    dispatch(startUploads(dropped, folderId));
  };

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

        {/* Search results span every folder: there is no single place to add to. */}
        {!searching && (
          <DropdownMenu
            label="New"
            triggerClassName={buttonClasses({ size: 'sm' })}
            trigger={
              <>
                <Plus className="size-4" aria-hidden="true" />
                New
              </>
            }
            items={[
              { label: 'Upload files', Icon: Upload, onSelect: openUploadDialog },
              { label: 'New folder', Icon: FolderPlus, onSelect: () => setNewFolderOpen(true) },
            ]}
          />
        )}
      </div>

      <NewFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        parentId={folderId}
      />

      <DropOverlay onFiles={uploadDropped} targetName={target.folderName}>
        <FileBrowser
          folders={folderList}
          files={fileList}
          viewMode={viewMode}
          // A new folder/search/filter = a new list: the selection starts empty.
          scope={`${folderId}|${q}|${category}`}
          currentFolderId={searching ? undefined : folderId}
          toolbar={
            <FilesToolbar
              params={params}
              onChange={updateParams}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          }
          placeholder={
            loading ? (
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
              <NothingHere
                searching={searching}
                q={q}
                category={category}
                onUpload={openUploadDialog}
              />
            ) : null
          }
          filesFooter={
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
          }
        />
      </DropOverlay>
    </div>
  );
}

function NothingHere({ searching, q, category, onUpload }) {
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
      description="Drop files anywhere on this page, or choose them from your device."
      action={
        <Button onClick={onUpload}>
          <Upload className="size-4" aria-hidden="true" />
          Upload files
        </Button>
      }
    />
  );
}

function LoadingState({ viewMode }) {
  return (
    <div aria-busy="true" aria-label="Loading files">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: viewMode === 'list' ? 0 : 10 }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
      {viewMode === 'list' &&
        Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mb-2 h-11" />)}
    </div>
  );
}
