import { createListenerMiddleware } from '@reduxjs/toolkit';
import { apiClient, toApiError } from '../../services/apiClient.js';
import { baseApi } from '../../services/baseApi.js';
import { selectConfig } from '../../services/configApi.js';
import { formatBytes } from '../../utils/format.js';
import { dashboardApi } from '../dashboard/dashboardApi.js';
import { sessionEnded } from '../auth/authSlice.js';
import { INVALIDATES } from '../files/cacheTags.js';
import { describeUploadError } from './uploadErrors.js';
import {
  canceled,
  failed,
  isActive,
  progressed,
  queued,
  started,
  succeeded,
} from './uploadSlice.js';

/**
 * The upload engine, as Redux thunks.
 *
 * - ONE request per file: each gets its own progress bar and can be cancelled alone.
 * - At most 3 at a time: enough to keep the connection busy, without dozens of
 *   parallel requests fighting over bandwidth (and the server's rate limit).
 * - Checks size and free space BEFORE sending, for instant feedback. The server
 *   checks again: these are conveniences, not security.
 */
export const MAX_PARALLEL = 3;

// Not serialisable, so kept beside the store, keyed by upload ID.
const pendingFiles = new Map();
const controllers = new Map();

/** Files chosen or dropped → queued uploads into `folderId` (null = root). */
export const startUploads = (fileList, folderId) => (dispatch, getState) => {
  const config = selectConfig(getState());
  const stats = dashboardApi.endpoints.getStats.select()(getState()).data;
  // Space still free, minus what queued/running uploads will take.
  let free =
    stats &&
    stats.remaining -
      getState()
        .uploads.items.filter(isActive)
        .reduce((sum, item) => sum + item.size, 0);

  const items = [...fileList].map((file) => {
    const item = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: file.type,
      folderId,
      status: 'queued',
      loaded: 0,
      error: null,
    };
    if (file.size > config.maxFileSizeBytes) {
      return {
        ...item,
        status: 'error',
        error: `Larger than the ${formatBytes(config.maxFileSizeBytes)} limit.`,
      };
    }
    if (free !== undefined && file.size > free) {
      return { ...item, status: 'error', error: 'Not enough storage space.' };
    }
    if (free !== undefined) free -= file.size;
    pendingFiles.set(item.id, file);
    return item;
  });

  dispatch(queued(items));
  dispatch(pump());
  return items.map((item) => item.id);
};

/** Starts queued uploads while fewer than MAX_PARALLEL are running. */
const pump = () => (dispatch, getState) => {
  const { items } = getState().uploads;
  let running = items.filter((item) => item.status === 'uploading').length;
  for (const item of items) {
    if (running >= MAX_PARALLEL) break;
    if (item.status === 'queued') {
      running += 1;
      dispatch(uploadOne(item));
    }
  }
};

const uploadOne = (item) => async (dispatch, getState) => {
  dispatch(started(item.id));
  const controller = new AbortController();
  controllers.set(item.id, controller);

  const form = new FormData();
  if (item.folderId) form.append('folderId', item.folderId);
  form.append('files', pendingFiles.get(item.id), item.name);

  let lastPercent = -1;
  try {
    const response = await apiClient.post('/files/upload', form, {
      signal: controller.signal,
      timeout: 0, // a big file on a slow connection can take far longer than 30 s
      onUploadProgress: ({ loaded }) => {
        // Progress fires many times per second; update the UI once per percent.
        const percent = item.size > 0 ? Math.floor((loaded / item.size) * 100) : 100;
        if (percent === lastPercent) return;
        lastPercent = percent;
        dispatch(progressed({ id: item.id, loaded: Math.min(loaded, item.size) }));
      },
    });
    dispatch(succeeded({ id: item.id, file: response.data?.data?.uploaded?.[0] }));
    scheduleRefresh(dispatch);
  } catch (error) {
    if (error.code === 'ERR_CANCELED') {
      dispatch(canceled(item.id));
    } else {
      const message = describeUploadError(toApiError(error), selectConfig(getState()));
      dispatch(failed({ id: item.id, error: message }));
    }
  } finally {
    controllers.delete(item.id);
    pendingFiles.delete(item.id);
    dispatch(pump()); // a slot is free: start the next one
  }
};

/** Cancels a queued upload (never sent) or a running one (aborts the request). */
export const cancelUpload = (id) => (dispatch) => {
  const controller = controllers.get(id);
  if (controller) {
    controller.abort(); // uploadOne's catch marks it canceled
  } else {
    pendingFiles.delete(id);
    dispatch(canceled(id));
  }
};

/**
 * Stops every upload: running requests are aborted, queued files are dropped. Used when
 * the session ends, so nothing keeps sending the previous user's files.
 */
export function abortAllUploads() {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  pendingFiles.clear();
}

/** Store middleware: abort uploads whenever the session ends (logout, expiry, reset). */
export const uploadsListener = createListenerMiddleware();
uploadsListener.startListening({ matcher: sessionEnded, effect: abortAllUploads });

/**
 * After uploads finish, file lists and storage numbers must refresh. Twenty small
 * files finishing within a second would mean twenty refetches; batching the ones that
 * finish close together means one.
 */
let refreshTimer = null;
function scheduleRefresh(dispatch) {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    dispatch(baseApi.util.invalidateTags(INVALIDATES.uploaded));
  }, 300);
}
