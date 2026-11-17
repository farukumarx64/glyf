import { createContext } from 'react';
import type { DocumentStore } from '../core/store.ts';

export const StateEditingContext = createContext<DocumentStore['updateState'] | undefined>(
  undefined,
);
