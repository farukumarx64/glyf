import type { ValidateFunction } from 'ajv';
import type { StructuralDocument } from './schema.ts';

declare const matchesSchema: ValidateFunction<StructuralDocument>;
export default matchesSchema;
