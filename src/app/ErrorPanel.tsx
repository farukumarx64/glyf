import { useEffect, useRef } from 'react';
import type { MosaicErrors } from '../core/errors.ts';

export type OpenFailure =
  { name: string; errors: MosaicErrors } | { name?: string; message: string };

export function ErrorPanel({ failure }: { failure: OpenFailure }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, [failure]);
  return (
    <section
      ref={panel}
      className="error-panel"
      role="alert"
      aria-labelledby="open-error"
      tabIndex={-1}
    >
      <h2 id="open-error">
        {failure.name ? `Could not open ${failure.name}` : 'Could not open document'}
      </h2>
      {'errors' in failure ? (
        <ul>
          {failure.errors.map((error, index) => (
            <li key={index}>
              <p>{error.message}</p>
              <div className="diagnostic">
                <code>{error.code}</code>{' '}
                <span>
                  JSON Pointer <code>{error.path || '""'}</code>
                  {error.path === '' && ' (document root)'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>{failure.message}</p>
      )}
    </section>
  );
}
