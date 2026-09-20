import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'query' | 'params';

/**
 * Parse req[source] with a Zod schema and replace it with the typed result
 * (applies defaults/coercion). Unparsed values never reach the handler.
 */
export function validate(schema: ZodTypeAny, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Express 4: req.query is a getter, so assign a merged copy instead.
    if (source === 'query') {
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      (req as unknown as Record<Source, unknown>)[source] = result.data;
    }
    next();
  };
}
