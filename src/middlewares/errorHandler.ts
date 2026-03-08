import { Request, Response, NextFunction } from "express";
import pino from "pino";

const logger = pino();

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = res.locals.correlationId as string | undefined;

  if (err instanceof AppError) {
    logger.error({ correlationId, statusCode: err.statusCode, error: err.message });
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  logger.error({ correlationId, statusCode: 500, error: err.message });
  res.status(500).json({ error: "Internal server error" });
}
