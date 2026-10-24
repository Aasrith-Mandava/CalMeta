import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';

/** zValidator that answers bad input with `{ message }`, the same shape as every other API error. */
export function validate<T extends keyof ValidationTargets, S extends z.ZodType>(target: T, schema: S) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
      return c.json({ message: `${where}${issue?.message ?? 'Invalid request'}` }, 400);
    }
  });
}
