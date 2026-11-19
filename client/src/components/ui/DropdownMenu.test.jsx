import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenu } from './DropdownMenu.jsx';

afterEach(cleanup);

function setup() {
  const actions = { rename: vi.fn(), share: vi.fn(), trash: vi.fn() };
  render(
    <>
      <DropdownMenu
        label="More actions"
        trigger="⋯"
        items={[
          { label: 'Rename', onSelect: actions.rename },
          { label: 'Share', onSelect: actions.share, disabled: true },
          { separator: true },
          { label: 'Move to trash', onSelect: actions.trash, danger: true },
        ]}
      />
      <p>Outside</p>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'More actions' });
  return { actions, trigger };
}

const focusedText = () => document.activeElement.textContent;

describe('DropdownMenu', () => {
  it('opens on click and moves focus to the first item', () => {
    const { trigger } = setup();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(focusedText()).toBe('Rename');
  });

  it('moves with the arrow keys, wraps around, and skips disabled items', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focusedText()).toBe('Move to trash'); // "Share" is disabled: skipped
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(focusedText()).toBe('Rename'); // wrapped to the top
    fireEvent.keyDown(menu, { key: 'End' });
    expect(focusedText()).toBe('Move to trash');
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(focusedText()).toBe('Rename');
  });

  it('Esc closes it and gives focus back to the button', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('runs the chosen action and closes; disabled items do nothing', () => {
    const { actions, trigger } = setup();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Share' }));
    expect(actions.share).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(actions.rename).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when clicking outside', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);

    fireEvent.pointerDown(screen.getByText('Outside'));

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with ArrowDown on the button (keyboard users)', () => {
    const { trigger } = setup();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByRole('menu')).toBeTruthy();
  });
});
