import { createSlice } from '@reduxjs/toolkit';
import { sessionEnded } from '../auth/authSlice.js';

/**
 * The upload list, as the UI shows it. Only plain data lives here (name, size,
 * status, progress): the File objects and AbortControllers are kept next to the
 * store in uploadQueue.js, because Redux state must be serialisable.
 *
 * item.status: queued → uploading → done | error | canceled
 */
const initialState = {
  items: [],
  dialogOpen: false,
  // Where new uploads go: { folderId, folderName } (folderId null = My Files root)
  target: { folderId: null, folderName: 'My Files' },
};

const find = (state, id) => state.items.find((item) => item.id === id);

const uploadSlice = createSlice({
  name: 'uploads',
  initialState,
  reducers: {
    queued(state, { payload: items }) {
      state.items.push(...items);
    },
    started(state, { payload: id }) {
      const item = find(state, id);
      if (item) item.status = 'uploading';
    },
    progressed(state, { payload: { id, loaded } }) {
      const item = find(state, id);
      if (item) item.loaded = loaded;
    },
    succeeded(state, { payload: { id, file } }) {
      const item = find(state, id);
      if (item) Object.assign(item, { status: 'done', loaded: item.size, fileId: file?.id });
    },
    failed(state, { payload: { id, error } }) {
      const item = find(state, id);
      if (item) Object.assign(item, { status: 'error', error });
    },
    canceled(state, { payload: id }) {
      const item = find(state, id);
      if (item && ['queued', 'uploading'].includes(item.status)) item.status = 'canceled';
    },
    removed(state, { payload: id }) {
      state.items = state.items.filter((item) => item.id !== id);
    },
    /** Removes everything that is no longer in progress. */
    finishedCleared(state) {
      state.items = state.items.filter((item) => ['queued', 'uploading'].includes(item.status));
    },
    dialogOpened(state, { payload: target }) {
      state.dialogOpen = true;
      if (target) state.target = target;
    },
    dialogClosed(state) {
      state.dialogOpen = false;
    },
  },
  // Logged out: the list (file names!) belonged to the previous user. Running requests
  // are aborted by the listener in uploadQueue.js.
  extraReducers: (builder) => {
    builder.addMatcher(sessionEnded, () => initialState);
  },
});

export const {
  queued,
  started,
  progressed,
  succeeded,
  failed,
  canceled,
  removed,
  finishedCleared,
  dialogOpened,
  dialogClosed,
} = uploadSlice.actions;

export const uploadsReducer = uploadSlice.reducer;

export const selectUploads = (state) => state.uploads.items;
export const selectUploadDialog = (state) => state.uploads;
export const isActive = (item) => item.status === 'queued' || item.status === 'uploading';
