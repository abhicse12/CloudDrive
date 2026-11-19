import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { Dialog } from './Dialog.jsx';

afterEach(cleanup);

const dialogEl = () => document.querySelector('dialog');

describe('Dialog', () => {
  it('shows nothing while closed, and a labelled modal when open', () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}} title="Rename" description="Pick a new name">
        <input aria-label="Name" />
      </Dialog>,
    );
    expect(dialogEl().hasAttribute('open')).toBe(false);
    expect(screen.queryByLabelText('Name')).toBeNull(); // children only render when open

    rerender(
      <Dialog open onClose={() => {}} title="Rename" description="Pick a new name">
        <input aria-label="Name" />
      </Dialog>,
    );
    expect(dialogEl().hasAttribute('open')).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Rename' })).toBeTruthy();
    expect(dialogEl().getAttribute('aria-describedby')).toBeTruthy();
  });

  it('asks the parent to close on Esc, backdrop click and the X button', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Hello">
        <p>Body</p>
      </Dialog>,
    );

    // Esc: the browser fires "cancel"; we must cancel its own closing (preventDefault).
    const esc = new Event('cancel', { cancelable: true });
    fireEvent(dialogEl(), esc);
    expect(esc.defaultPrevented).toBe(true);

    fireEvent.click(dialogEl()); // the <dialog> itself = the backdrop
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByText('Body')); // inside the content: stays open
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('cannot be dismissed when dismissible is false', () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="Busy" dismissible={false} />);

    fireEvent(dialogEl(), new Event('cancel', { cancelable: true }));
    fireEvent.click(dialogEl());

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

describe('ConfirmDialog', () => {
  it('confirms, and shows an error inside the dialog', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        title="Delete forever?"
        confirmLabel="Delete"
        danger
        error="Could not delete."
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toContain('Could not delete.');
  });

  it('locks itself while the action is running', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog open loading onClose={onClose} onConfirm={() => {}} title="Deleting" />);

    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    fireEvent(dialogEl(), new Event('cancel', { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
