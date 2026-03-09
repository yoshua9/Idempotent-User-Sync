import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import pino from "pino";
import { syncUser } from "../services/userService";
import { AppError } from "../middlewares/errorHandler";

const logger = pino();

const syncUserSchema = z.object({
  credential: z.string().trim().min(1).max(255),
  email:      z.string().trim().email().max(255).transform((v) => v.toLowerCase()),
  name:       z.string().trim().min(1).max(255),
});

const syncRouter = Router();

syncRouter.post("/sync/user", async (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const correlationId = res.locals.correlationId as string;

  try {
    const parsed = syncUserSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, "Validation failed", parsed.error.issues);
    }

    const result = await syncUser(parsed.data);

    logger.info({ correlationId, method: req.method, path: req.path, statusCode: 200, durationMs: Date.now() - start });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default syncRouter;
