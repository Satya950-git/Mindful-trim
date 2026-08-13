import type { Express } from "express";
import { createServer, type Server } from "node:http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { jwtMiddleware } from "./routes/middleware";
import { registerAuthRoutes } from "./routes/auth";
import { registerExerciseRoutes } from "./routes/exercises";
import { registerStateRoutes } from "./routes/state";
import { registerProgressionRoutes } from "./routes/progression";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerMiscRoutes } from "./routes/misc";
import { registerHabitRoutes } from "./routes/habits";
import { registerFriendRoutes } from "./routes/friends";
import { registerChallengeRoutes } from "./routes/challenges";
import { registerCommunityRoutes } from "./routes/communities";
import { registerOneOnOneRoutes } from "./routes/oneOnOne";
import { registerCoopRoutes } from "./routes/coop";

export async function registerRoutes(app: Express): Promise<Server> {
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        pool,
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60,
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      proxy: process.env.NODE_ENV === "production",
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.use(jwtMiddleware);

  registerMiscRoutes(app);
  registerAuthRoutes(app);
  registerExerciseRoutes(app);
  registerStateRoutes(app);
  registerProgressionRoutes(app);
  registerNotificationRoutes(app);
  await registerHabitRoutes(app);
  registerFriendRoutes(app);
  registerChallengeRoutes(app);
  registerCommunityRoutes(app);
  registerOneOnOneRoutes(app);
  registerCoopRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
