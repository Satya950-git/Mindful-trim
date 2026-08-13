import express from "express";
import helmet from "helmet";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { backfillProgressionForAllUsers } from "./storage";
import { seedConfigTables } from "./seed";
import { pool } from "./db";
import * as fs from "fs";
import * as path from "path";

// ── One-time: backfill Hindi title/message for notifications created before
//    the bilingual columns existed.  Idempotent – only touches rows where
//    title_hi IS NULL.  Runs after the ALTER TABLE columns migration.
async function backfillNotificationHindi(): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: string; challenge_type: string | null; title: string; message: string;
    }>(
      `SELECT id, challenge_type, title, message FROM user_notifications WHERE title_hi IS NULL`
    );
    if (rows.length === 0) return;

    const TITLE_HI: Record<string, string> = {
      'friend-request': 'नई मित्र अनुरोध 👋',
      '1on1-invite':   '1-ऑन-1 चुनौती आमंत्रण 🤝',
      'coop-invite':   'समूह आमंत्रण 🎯',
      '1on1':          'जवाबदेही अनुस्मारक 👊',
      'coop':          'समूह जवाबदेही अनुस्मारक 👊',
    };

    let updated = 0;
    for (const row of rows) {
      const ct = row.challenge_type ?? '';
      let titleHi: string | null = TITLE_HI[ct] ?? null;
      let messageHi: string | null = null;
      let m: RegExpMatchArray | null;

      if (ct === 'friend-request') {
        m = row.message.match(/^(.+) sent you a friend request/);
        if (m) messageHi = `${m[1]} ने आपको मित्र अनुरोध भेजा है`;
      } else if (ct === '1on1-invite') {
        m = row.message.match(/^(.+) challenged you to: (.+)$/);
        if (m) messageHi = `${m[1]} ने आपको चुनौती दी: ${m[2]}`;
      } else if (ct === 'coop-invite') {
        m = row.message.match(/^(.+) invited you to join the group habits "(.+?)"/);
        if (m) messageHi = `${m[1]} ने आपको "${m[2]}" समूह दिनचर्या में शामिल होने के लिए आमंत्रित किया।`;
        else {
          m = row.message.match(/^(.+) invited you/);
          if (m) messageHi = `${m[1]} ने आपको समूह दिनचर्या में शामिल होने के लिए आमंत्रित किया।`;
        }
      } else if (ct === '1on1') {
        m = row.message.match(/^(.+) is waiting for you to complete your habit: (.+?)!?$/);
        if (m) messageHi = `${m[1]} आपकी प्रतीक्षा कर रहे हैं कि आप अपनी आदत पूरी करें: ${m[2]}!`;
        else {
          m = row.message.match(/^(.+) is waiting for you/);
          if (m) messageHi = `${m[1]} आपकी प्रतीक्षा कर रहे हैं कि आप अपनी आदत पूरी करें!`;
        }
      } else if (ct === 'coop') {
        m = row.message.match(/^(.+) and the group are waiting/);
        if (m) messageHi = `${m[1]} और समूह आपकी प्रतीक्षा कर रहे हैं कि आप अपनी दिनचर्या पूरी करें!`;
      } else {
        // GENERAL type – friend-accepted pattern
        m = row.message.match(/^(.+) accepted your friend request/);
        if (m) {
          titleHi = 'मित्र अनुरोध स्वीकार 🎉';
          messageHi = `${m[1]} ने आपका मित्र अनुरोध स्वीकार किया`;
        }
      }

      if (titleHi || messageHi) {
        await pool.query(
          `UPDATE user_notifications SET title_hi = $1, message_hi = $2
           WHERE id = $3 AND title_hi IS NULL`,
          [titleHi, messageHi, row.id]
        );
        updated++;
      }
    }
    if (updated > 0) console.log(`[migration] Backfilled Hindi for ${updated} notifications`);
  } catch (err) {
    console.error('[migration] backfillNotificationHindi failed:', err);
  }
}

// ── Global crash guards ──────────────────────────────────────────────────────
// These prevent the Node.js process from exiting on unhandled async errors
// (e.g. unexpected DB connection drops mid-query). The error is logged so it
// remains visible in deployment logs, but the server keeps serving requests.
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection — server will continue:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception — server will continue:", err);
});

const app = express();
const log = console.log;

// Trust the reverse proxy (Replit/Google Frontend) so that
// express-rate-limit and sessions correctly identify client IPs
// via the X-Forwarded-For header in production.
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }

    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }

    const origin = req.header("origin");

    // Allow localhost origins for Expo web development (any port) — dev only
    const isLocalhost =
      process.env.NODE_ENV !== "production" &&
      (origin?.startsWith("http://localhost:") ||
        origin?.startsWith("http://127.0.0.1:"));

    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

function setupRequestLogging(app: express.Application) {
  const isDev = process.env.NODE_ENV !== "production";

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    if (isDev) {
      const originalResJson = res.json;
      res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
      };
    }

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      if (isDev && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

const ALLOWED_PLATFORMS = new Set(["ios", "android"]);

function serveExpoManifest(platform: string, res: Response) {
  if (!ALLOWED_PLATFORMS.has(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }

  // Explicitly sanitize platform to prevent any path traversal
  const safePlatform = platform === "ios" ? "ios" : "android";

  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    safePlatform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) { // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8"); // nosemgrep: javascript.lang.security.audit.detect-non-literal-fs-filename
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;

  // The Expo Go deep link / QR code must point at the Metro packager's
  // own domain (the dedicated `.expo.` subdomain Replit provisions for
  // Expo Go's manifest/packager handshake), NOT at whatever host served
  // this landing page. In dev this landing page is served from the
  // Express server (a different port/domain than Metro on 8081), so
  // reusing the request host here points Expo Go at a host that isn't
  // running the packager at all — surfacing as "Packager is not running"
  // for any client (e.g. Android simulate) that follows this link/QR
  // instead of using a directly-provided Metro URL.
  const packagerDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  const expsUrl =
    process.env.NODE_ENV !== "production" && packagerDomain
      ? packagerDomain
      : host;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  const resetPagePath = path.resolve(process.cwd(), "server", "templates", "reset-password.html");
  app.get("/reset-password", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(fs.readFileSync(resetPagePath, "utf-8"));
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

(async () => {
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }));
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  // Ensure the connect-pg-simple session table exists.
  // drizzle-kit push can drop it (it's not in the Drizzle schema); recreate it
  // explicitly BEFORE routes are registered so the session middleware never
  // encounters a missing table.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    varchar       NOT NULL COLLATE "default",
      "sess"   json          NOT NULL,
      "expire" timestamp(6)  NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `).catch(err => console.error('[migration] session table creation failed:', err));

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  seedConfigTables().catch(err =>
    console.error('Config table seeding failed:', err)
  );

  backfillProgressionForAllUsers().catch(err =>
    console.error('Progression backfill failed:', err)
  );

  pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='unique_tag'
      ) THEN
        ALTER TABLE users ADD COLUMN unique_tag VARCHAR(4);
      END IF;
    END $$;
    UPDATE users SET unique_tag = upper(substring(md5(id), 1, 4)) WHERE unique_tag IS NULL;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='users_identity_tag_uniq'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_identity_tag_uniq UNIQUE (identity, unique_tag);
      END IF;
    END $$;
  `).catch(err => console.error('unique_tag migration failed:', err));

  pool.query(`
    CREATE TABLE IF NOT EXISTS group_challenges (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(60) NOT NULL,
      pillar VARCHAR(20) NOT NULL,
      duration_days INT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS challenge_participants (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      challenge_id VARCHAR NOT NULL REFERENCES group_challenges(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP,
      personal_end_date DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'invited',
      UNIQUE(challenge_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS challenge_participants_user_idx ON challenge_participants(user_id, status);
    CREATE INDEX IF NOT EXISTS challenge_participants_challenge_idx ON challenge_participants(challenge_id, status);
  `).catch(err => console.error('group_challenges migration failed:', err));

  pool.query(`
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS trusted_devices_user_idx ON trusted_devices(user_id);
  `).catch(err => console.error('trusted_devices migration failed:', err));

  pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='user_habits' AND column_name='pillar_visibility'
      ) THEN
        ALTER TABLE user_habits ADD COLUMN pillar_visibility JSONB DEFAULT '{}';
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS habit_nudges (
      id SERIAL PRIMARY KEY,
      sender_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      habit_id TEXT NOT NULL,
      sent_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS habit_nudges_receiver_idx ON habit_nudges(receiver_id, sent_at);
    CREATE INDEX IF NOT EXISTS habit_nudges_rate_limit_idx ON habit_nudges(sender_id, habit_id, sent_at);
  `).catch(err => console.error('habit_nudges/pillar_visibility migration failed:', err));

  pool.query(`
    CREATE TABLE IF NOT EXISTS one_on_one_challenges (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      challenger_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challengee_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      habit_name VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS one_on_one_challenger_idx ON one_on_one_challenges(challenger_id, status);
    CREATE INDEX IF NOT EXISTS one_on_one_challengee_idx ON one_on_one_challenges(challengee_id, status);

    CREATE TABLE IF NOT EXISTS coop_groups (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      invite_token VARCHAR(32) NOT NULL UNIQUE DEFAULT md5(gen_random_uuid()::text),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS coop_groups_creator_idx ON coop_groups(creator_id);

    CREATE TABLE IF NOT EXISTS coop_group_habits (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id VARCHAR NOT NULL REFERENCES coop_groups(id) ON DELETE CASCADE,
      habit_name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS coop_group_habits_group_idx ON coop_group_habits(group_id);

    CREATE TABLE IF NOT EXISTS coop_group_members (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id VARCHAR NOT NULL REFERENCES coop_groups(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(group_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS coop_group_members_user_idx ON coop_group_members(user_id, status);
    CREATE INDEX IF NOT EXISTS coop_group_members_group_idx ON coop_group_members(group_id, status);

    CREATE TABLE IF NOT EXISTS nudges (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      context_type VARCHAR(10) NOT NULL,
      context_id VARCHAR NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS nudges_recipient_idx ON nudges(recipient_id, created_at);

    CREATE TABLE IF NOT EXISTS coop_habit_completions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id VARCHAR NOT NULL REFERENCES coop_groups(id) ON DELETE CASCADE,
      habit_id VARCHAR NOT NULL REFERENCES coop_group_habits(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed_date DATE NOT NULL,
      UNIQUE(habit_id, user_id, completed_date)
    );
    CREATE INDEX IF NOT EXISTS coop_habit_completions_lookup_idx ON coop_habit_completions(group_id, completed_date);

    ALTER TABLE one_on_one_challenges
      ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT TRUE;

    CREATE TABLE IF NOT EXISTS one_on_one_logs (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      challenge_id VARCHAR NOT NULL REFERENCES one_on_one_challenges(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed_date DATE NOT NULL,
      UNIQUE(challenge_id, user_id, completed_date)
    );
    CREATE INDEX IF NOT EXISTS one_on_one_logs_lookup_idx ON one_on_one_logs(challenge_id, user_id, completed_date);
  `).catch(err => console.error('social challenges migration failed:', err));

  // Uniqueness of (creator_id, name) on coop_groups is enforced at the
  // application layer in server/services/coopService.ts to avoid DB-level
  // index conflicts on publish. No startup DDL needed here.

  pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='subscription_type'
      ) THEN
        ALTER TABLE users ADD COLUMN subscription_type VARCHAR(1) DEFAULT 'F';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='users' AND column_name='valid_till'
      ) THEN
        ALTER TABLE users ADD COLUMN valid_till TIMESTAMP;
      END IF;
    END $$;
  `).catch(err => console.error('subscription columns migration failed:', err));

  pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title          TEXT NOT NULL,
      message        TEXT NOT NULL,
      type           VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
      challenge_type VARCHAR(20),
      challenge_id   VARCHAR,
      is_read        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      clicked_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS user_notifications_user_idx         ON user_notifications (user_id);
    CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx ON user_notifications (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS user_notifications_user_read_idx    ON user_notifications (user_id, is_read);
  `).catch(err => console.error('user_notifications migration failed:', err));

  // Add bilingual columns to user_notifications (title_hi / message_hi),
  // then backfill Hindi text for any existing rows that are missing it.
  pool.query(`
    ALTER TABLE user_notifications
      ADD COLUMN IF NOT EXISTS title_hi   TEXT,
      ADD COLUMN IF NOT EXISTS message_hi TEXT;
  `)
  .then(() => backfillNotificationHindi())
  .catch(err => console.error('user_notifications bilingual columns migration failed:', err));

  // Add notify_enabled to user_habits (mirrors server/migrations/001_add_journey_fields.sql)
  pool.query(`
    ALTER TABLE user_habits
      ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  `).catch(err => console.error('user_habits notify_enabled migration failed:', err));

  pool.query(`
    CREATE TABLE IF NOT EXISTS communities (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      description TEXT DEFAULT '',
      pillar VARCHAR(20) NOT NULL DEFAULT 'Mental',
      creator_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invite_token VARCHAR(32) NOT NULL UNIQUE DEFAULT md5(gen_random_uuid()::text),
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS community_members (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      community_id VARCHAR NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(10) NOT NULL DEFAULT 'member',
      status VARCHAR(10) NOT NULL DEFAULT 'pending',
      joined_at TIMESTAMP,
      UNIQUE(community_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS community_members_user_idx ON community_members(user_id, status);
    CREATE INDEX IF NOT EXISTS community_members_community_idx ON community_members(community_id, status);
    CREATE TABLE IF NOT EXISTS community_posts (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      community_id VARCHAR NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      author_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      is_flagged BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS community_posts_community_idx ON community_posts(community_id, created_at);
  `).catch(err => console.error('communities migration failed:', err));

  // Ensure unique constraints exist that mirror the Drizzle schema definitions.
  // Pre-creating them here means drizzle-kit push (post-merge.sh) sees them as
  // already applied and skips re-creation — preventing "Failed to run database
  // migration statement" errors on every task merge.
  pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'habit_logs_user_habit_date_uniq') THEN
        ALTER TABLE habit_logs ADD CONSTRAINT habit_logs_user_habit_date_uniq UNIQUE (user_id, habit_id, date);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_fuel_user_date_uniq') THEN
        ALTER TABLE daily_fuel_logs ADD CONSTRAINT daily_fuel_user_date_uniq UNIQUE (user_id, date);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_habits_user_habit_uniq') THEN
        ALTER TABLE user_habits ADD CONSTRAINT user_habits_user_habit_uniq UNIQUE (user_id, habit_id);
      END IF;
    END $$;
  `).catch(err => console.error('schema-sync constraints migration failed:', err));

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`express server serving on port ${port}`);
    },
  );
})();
