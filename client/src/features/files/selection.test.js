import { describe, expect, it } from 'vitest';
import { blockedDestinations, childrenByParent } from './folderTree.js';
import { EMPTY_SELECTION, clickSelection, visibleSelection } from './selection.js';

const ORDER = ['folder:a', 'folder:b', 'file:1', 'file:2', 'file:3'];
const click = (state, key, mods = {}) => clickSelection(state, key, mods, ORDER);
const keys = (state) => [...state.selected];

describe('selection rules', () => {
  it('a plain click selects only that item', () => {
    let state = click(EMPTY_SELECTION, 'file:1');
    state = click(state, 'file:2');

    expect(keys(state)).toEqual(['file:2']);
  });

  it('Ctrl/⌘-click adds and removes items', () => {
    let state = click(EMPTY_SELECTION, 'file:1');
    state = click(state, 'folder:a', { toggle: true });
    expect(keys(state).sort()).toEqual(['file:1', 'folder:a']);

    state = click(state, 'file:1', { toggle: true });
    expect(keys(state)).toEqual(['folder:a']);
  });

  it('Shift-click selects the range from the anchor, in screen order, both directions', () => {
    let state = click(EMPTY_SELECTION, 'folder:b');
    state = click(state, 'file:3', { range: true });
    expect(keys(state)).toEqual(['folder:b', 'file:1', 'file:2', 'file:3']);

    // Anchor stays on folder:b: shift-clicking upwards redraws the range.
    state = click(state, 'folder:a', { range: true });
    expect(keys(state)).toEqual(['folder:a', 'folder:b']);
  });

  it('Ctrl+Shift adds a range to what is already selected', () => {
    let state = click(EMPTY_SELECTION, 'folder:a');
    state = click(state, 'file:2', { toggle: true }); // anchor = file:2
    state = click(state, 'file:3', { toggle: true, range: true });

    expect(keys(state).sort()).toEqual(['file:2', 'file:3', 'folder:a']);
  });

  it('Shift-click with no anchor acts like a plain click', () => {
    expect(keys(click(EMPTY_SELECTION, 'file:2', { range: true }))).toEqual(['file:2']);
  });

  it('items that left the screen are no longer selected', () => {
    const state = { selected: new Set(['file:1', 'file:gone']), anchor: 'file:1' };

    expect([...visibleSelection(state, ORDER)]).toEqual(['file:1']);
  });
});

describe('folder tree', () => {
  const FOLDERS = [
    { id: 'docs', name: 'Docs', parentId: null },
    { id: 'work', name: 'work', parentId: 'docs' },
    { id: '2026', name: '2026', parentId: 'work' },
    { id: 'art', name: 'Art', parentId: 'docs' },
    { id: 'pics', name: 'Pics', parentId: null },
  ];

  it('groups folders by parent, sorted by name ignoring case', () => {
    const tree = childrenByParent(FOLDERS);

    expect(tree.get(null).map((f) => f.name)).toEqual(['Docs', 'Pics']);
    expect(tree.get('docs').map((f) => f.name)).toEqual(['Art', 'work']);
  });

  it('blocks moving a folder into itself or anything inside it', () => {
    const blocked = blockedDestinations(FOLDERS, ['docs']);

    expect([...blocked].sort()).toEqual(['2026', 'art', 'docs', 'work']);
    expect(blocked.has('pics')).toBe(false);
  });
});
