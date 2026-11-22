/** Keep document-controlled IDs separate from the viewer's own DOM IDs. */
export function nodeAnchorId(id: string): string {
  return `glyf-node-${id}`;
}

const nodeFragment = /^#[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function markdownUrl(value: string, key: string): string | undefined {
  if (key !== 'href') return undefined;

  if (nodeFragment.test(value)) return `#${nodeAnchorId(value.slice(1))}`;

  // A base URL would also resolve relative paths and network-path references.
  if (/^(?:https?:\/\/[^/\\?#]|mailto:)/i.test(value) && URL.canParse(value)) return value;
  return undefined;
}
