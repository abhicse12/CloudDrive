import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from './Input.jsx';

/** Password field with a show/hide toggle (fewer typos, so no "confirm password" field). */
export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);

  return (
    <Input type={visible ? 'text' : 'password'} {...props}>
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-fg-subtle transition-colors hover:text-fg"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </Input>
  );
}
