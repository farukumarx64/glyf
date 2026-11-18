import { useEffect, useRef } from 'react';
import type { MosaicErrors } from '../core/errors.ts';

export type FileFailure =
  { name: string; errors: MosaicErrors } | { name?: string; message: string };

export function ErrorPanel({
  failure,
  operation,
}: {
  failure: FileFailure;
  operation: 'open' | 'download';
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, [failure]);
  return (
    <section
      ref={panel}
      className="error-panel"
      role="alert"
      aria-labelledby="file-error"
      tabIndex={-1}
    >
      <h2 id="file-error">
        Could not {operation} {failure.name || 'document'}
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
