export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, msg: string, details?: unknown) => new HttpError(400, code, msg, details);
export const unauthorized = (msg = 'Debes iniciar sesión.') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (code: string, msg: string) => new HttpError(403, code, msg);
export const notFound = (msg = 'No encontrado.') => new HttpError(404, 'not_found', msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);
export const tooMany = (msg = 'Demasiados intentos. Espera un momento.') => new HttpError(429, 'rate_limited', msg);
