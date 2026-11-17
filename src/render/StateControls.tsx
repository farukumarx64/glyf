import { useContext, useId } from 'react';
import type { DocumentStore } from '../core/store.ts';
import type { InputNode, ToggleNode, MosaicScalar } from '../core/types.ts';
import type { NodeView } from './nodeRegistry.tsx';
import { StateEditingContext } from './state-editing-context.ts';
import { useValueDraft } from './useValueDraft.ts';

function controlLabel(node: InputNode | ToggleNode) {
  return node.label.trim() ? node.label : node.bind;
}

function EditableInput({
  node,
  value,
  anchorId,
  updateState,
}: {
  node: InputNode;
  value: MosaicScalar;
  anchorId: string;
  updateState: DocumentStore['updateState'];
}) {
  const inputId = useId();
  const errorId = useId();
  const draft = useValueDraft(value, (next) => updateState(node.bind, next));
  const field = {
    id: inputId,
    value: draft.text,
    'aria-invalid': draft.error ? true : undefined,
    'aria-describedby': draft.error ? errorId : undefined,
    onKeyDown: draft.restore,
  } as const;
  return (
    <div id={anchorId} className="mosaic-input">
      <label htmlFor={inputId}>{controlLabel(node)}</label>
      {node.kind === 'text' ? (
        <textarea
          {...field}
          rows={2}
          onChange={(event) => draft.commit(event.currentTarget.value)}
        />
      ) : (
        <input
          {...field}
          type="text"
          inputMode="decimal"
          onChange={(event) => draft.changeNumber(event.currentTarget.value)}
          onBlur={draft.normalize}
        />
      )}
      {draft.error && (
        <p id={errorId} className="mosaic-control-error" role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}

function EditableToggle({
  node,
  value,
  anchorId,
  updateState,
}: {
  node: ToggleNode;
  value: MosaicScalar;
  anchorId: string;
  updateState: DocumentStore['updateState'];
}) {
  const errorId = useId();
  const draft = useValueDraft(value, (next) => updateState(node.bind, next));
  return (
    <div id={anchorId} className="mosaic-toggle">
      <label>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => draft.commit(event.currentTarget.checked)}
          onKeyDown={draft.restore}
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? errorId : undefined}
        />
        {controlLabel(node)}
      </label>
      {draft.error && (
        <p id={errorId} className="mosaic-control-error" role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}

export const InputView: NodeView<'input'> = ({ node, document, anchorId }) => {
  const updateState = useContext(StateEditingContext);
  const value = document.state![node.bind]!;
  if (updateState)
    return (
      <EditableInput node={node} value={value} anchorId={anchorId} updateState={updateState} />
    );
  const text = String(value);
  return (
    <label id={anchorId}>
      {controlLabel(node)}
      {node.kind === 'text' && /[\r\n]/.test(text) ? (
        <textarea value={text} disabled />
      ) : (
        <input type={node.kind} value={text} disabled />
      )}
    </label>
  );
};

export const ToggleView: NodeView<'toggle'> = ({ node, document, anchorId }) => {
  const updateState = useContext(StateEditingContext);
  const value = document.state![node.bind]!;
  if (updateState)
    return (
      <EditableToggle node={node} value={value} anchorId={anchorId} updateState={updateState} />
    );
  return (
    <label id={anchorId}>
      <input type="checkbox" checked={value === true} disabled />
      {controlLabel(node)}
    </label>
  );
};
