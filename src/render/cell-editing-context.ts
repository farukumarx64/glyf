import { createContext } from 'react';
import type { DocumentStore } from '../core/store.ts';

export const CellEditingContext = createContext<DocumentStore['updateCell'] | undefined>(undefined);
