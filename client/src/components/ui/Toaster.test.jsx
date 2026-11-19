import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from './Toaster.jsx';
import { resetToasts, toast } from './toast.js';

beforeEach(() => {
  vi.useFakeTimers();
  render(<Toaster />);
});
afterEach(() => {
  act(() => resetToasts());
  cleanup();
  vi.useRealTimers();
});

describe('toasts', () => {
  it('shows a message and hides it after a few seconds', () => {
    act(() => toast.success('Folder created'));
    expect(screen.getByRole('status').textContent).toContain('Folder created');

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText('Folder created')).toBeNull();
  });

  it('announces errors as alerts and keeps them longer', () => {
    act(() => toast.error('Upload failed'));
    act(() => vi.advanceTimersByTime(5000));

    expect(screen.getByRole('alert').textContent).toContain('Upload failed');
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText('Upload failed')).toBeNull();
  });

  it('runs the action (e.g. Undo) and dismisses the toast', () => {
    const undo = vi.fn();
    act(() => toast.success('Moved to trash', { action: { label: 'Undo', onClick: undo } }));

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Moved to trash')).toBeNull();
  });

  it('can be dismissed by hand, and shows at most 4 at once', () => {
    act(() => {
      for (let i = 1; i <= 5; i += 1) toast.info(`Message ${i}`);
    });
    expect(screen.getAllByRole('status')).toHaveLength(4);
    expect(screen.queryByText('Message 1')).toBeNull(); // oldest dropped

    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });
});
