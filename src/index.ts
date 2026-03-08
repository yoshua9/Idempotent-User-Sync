import express from "express";
import dotenv from "dotenv";
import { correlationId } from "./middlewares/correlationId";
import healthRouter from "./routes/healthRouter";
import syncRouter from "./routes/syncRouter";
import { auth } from "./middlewares/auth";
import { errorHandler } from "./middlewares/errorHandler";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(correlationId);
app.use(healthRouter);
app.use(auth);
app.use(syncRouter);
app.use(errorHandler);

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export default app;
