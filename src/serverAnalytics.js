import { Pool } from "pg";
import { timingSafeEqual } from "node:crypto";

export const ANALYTICS_EVENT_TYPES = new Set([
  "profile_selected",
  "session_start",
  "question_answered",
  "feedback_sent",
]);

const MAX_METADATA_BYTES = 4000;
const DEFAULT_BETA_DAYS = 10;

export const ANALYTICS_SCHEMA_STATEMENTS = [
  `
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
  `
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id
  ON analytics_events(user_id);
`,
  `
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
  ON analytics_events(created_at);
`,
  `
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created_at
  ON analytics_events(event_type, created_at);
`,
  `
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created_at
  ON analytics_events(user_id, created_at);
`,
];

export const ANALYTICS_SCHEMA_SQL = `${ANALYTICS_SCHEMA_STATEMENTS.join("\n\n")}`;

let analyticsPool = null;
const schemaReadyPromises = new WeakMap();

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDay(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function secureCompare(left, right) {
  const leftBuffer = Buffer.from(left ?? "");
  const rightBuffer = Buffer.from(right ?? "");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function renderTable(headers, rows, emptyCopy) {
  if (rows.length === 0) {
    return `<div class="empty-card">${escapeHtml(emptyCopy)}</div>`;
  }

  const headerMarkup = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rowMarkup = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<div class="table-wrap"><table><thead><tr>${headerMarkup}</tr></thead><tbody>${rowMarkup}</tbody></table></div>`;
}

function getCompletionRows(rows, totalQuestions) {
  return rows.map((row) => {
    const completionRate = totalQuestions === 0 ? 0 : Math.round((row.distinctAnswered / totalQuestions) * 100);
    return [
      row.userId,
      row.distinctAnswered,
      totalQuestions,
      `${completionRate}%`,
      row.totalAnswerEvents,
    ];
  });
}

export function getAnalyticsConfig(env = process.env) {
  const connectionString = env.ANALYTICS_DATABASE_URL || env.DATABASE_URL || "";
  const hasDiscreteConfig = Boolean(env.PGHOST || env.PGHOSTADDR);
  const adminUser = env.ADMIN_USER || "";
  const adminPass = env.ADMIN_PASS || "";
  const sslMode = env.PGSSLMODE || "";
  const betaWindowDays = Number.parseInt(env.ANALYTICS_BETA_DAYS || `${DEFAULT_BETA_DAYS}`, 10);

  return {
    analyticsEnabled: Boolean(connectionString || hasDiscreteConfig),
    connectionString,
    adminUser,
    adminPass,
    betaWindowDays: Number.isFinite(betaWindowDays) && betaWindowDays > 0 ? betaWindowDays : DEFAULT_BETA_DAYS,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : undefined,
  };
}

export function createAnalyticsPool(env = process.env) {
  const config = getAnalyticsConfig(env);

  if (!config.analyticsEnabled) {
    return null;
  }

  return new Pool({
    connectionString: config.connectionString || undefined,
    ssl: config.ssl,
  });
}

export function getAnalyticsPool(env = process.env) {
  if (!analyticsPool) {
    analyticsPool = createAnalyticsPool(env);
  }

  return analyticsPool;
}

export async function ensureAnalyticsSchema(pool) {
  if (!pool) {
    return;
  }

  if (!schemaReadyPromises.has(pool)) {
    schemaReadyPromises.set(
      pool,
      (async () => {
        for (const statement of ANALYTICS_SCHEMA_STATEMENTS) {
          await pool.query(statement);
        }
      })(),
    );
  }

  await schemaReadyPromises.get(pool);
}

export function validateAnalyticsPayload(payload) {
  const userId = typeof payload?.userId === "string" ? payload.userId.trim() : "";
  const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId.trim() : "";
  const eventType = typeof payload?.eventType === "string" ? payload.eventType.trim() : "";
  const metadata = isObject(payload?.metadata) ? payload.metadata : {};
  const metadataString = JSON.stringify(metadata);

  if (!userId) {
    return { ok: false, statusCode: 400, error: "userId is required." };
  }

  if (!sessionId) {
    return { ok: false, statusCode: 400, error: "sessionId is required." };
  }

  if (!ANALYTICS_EVENT_TYPES.has(eventType)) {
    return { ok: false, statusCode: 400, error: "Unsupported analytics event." };
  }

  if (Buffer.byteLength(metadataString, "utf8") > MAX_METADATA_BYTES) {
    return { ok: false, statusCode: 400, error: "Analytics metadata is too large." };
  }

  return {
    ok: true,
    value: {
      userId: userId.slice(0, 120),
      sessionId: sessionId.slice(0, 120),
      eventType,
      metadata,
    },
  };
}

export async function insertAnalyticsEvent(pool, event, now = new Date()) {
  await ensureAnalyticsSchema(pool);
  await pool.query(
    `
      INSERT INTO analytics_events (user_id, session_id, event_type, metadata, created_at)
      VALUES ($1, $2, $3, $4::jsonb, $5)
    `,
    [
      event.userId,
      event.sessionId,
      event.eventType,
      JSON.stringify(event.metadata ?? {}),
      now.toISOString(),
    ],
  );
}

export function verifyAdminAuthHeader(authHeader, env = process.env) {
  const { adminUser, adminPass } = getAnalyticsConfig(env);

  if (!adminUser || !adminPass) {
    return { ok: false, statusCode: 503, error: "Admin dashboard is not configured." };
  }

  if (!authHeader?.startsWith("Basic ")) {
    return { ok: false, statusCode: 401, error: "Authentication required." };
  }

  const decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex < 0) {
    return { ok: false, statusCode: 401, error: "Authentication required." };
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (!secureCompare(username, adminUser) || !secureCompare(password, adminPass)) {
    return { ok: false, statusCode: 401, error: "Authentication required." };
  }

  return { ok: true };
}

export function getWindowDays(url, env = process.env) {
  const { betaWindowDays } = getAnalyticsConfig(env);
  const urlObject = new URL(url, "http://localhost");
  const requested = Number.parseInt(urlObject.searchParams.get("days") || `${betaWindowDays}`, 10);
  return Number.isFinite(requested) && requested > 0 ? requested : betaWindowDays;
}

export function getWindowStart(days, now = new Date()) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - (days - 1),
    0,
    0,
    0,
    0,
  ));
}

export async function fetchAdminDashboardData(pool, { days = DEFAULT_BETA_DAYS, questionCount = 0, now = new Date() } = {}) {
  await ensureAnalyticsSchema(pool);
  const since = getWindowStart(days, now);

  const [dauResult, questionsResult, retentionResult, sessionsResult, completionResult, dropoffResult, leaderboardResult] =
    await Promise.all([
      pool.query(
        `
          SELECT DATE(created_at) AS day, COUNT(DISTINCT user_id)::int AS dau
          FROM analytics_events
          WHERE created_at >= $1
          GROUP BY 1
          ORDER BY 1
        `,
        [since.toISOString()],
      ),
      pool.query(
        `
          SELECT DATE(created_at) AS day, user_id, COUNT(*)::int AS questions
          FROM analytics_events
          WHERE created_at >= $1
            AND event_type = 'question_answered'
          GROUP BY 1, 2
          ORDER BY 1 DESC, 3 DESC, 2
        `,
        [since.toISOString()],
      ),
      pool.query(
        `
          WITH daily AS (
            SELECT DISTINCT DATE(created_at) AS day, user_id
            FROM analytics_events
            WHERE created_at >= $1
          )
          SELECT daily.day,
                 COUNT(DISTINCT daily.user_id)::int AS active_users,
                 COUNT(DISTINCT next_day.user_id)::int AS retained_users
          FROM daily
          LEFT JOIN daily AS next_day
            ON next_day.user_id = daily.user_id
           AND next_day.day = daily.day + 1
          GROUP BY daily.day
          ORDER BY daily.day
        `,
        [since.toISOString()],
      ),
      pool.query(
        `
          SELECT DATE(created_at) AS day, user_id, COUNT(DISTINCT session_id)::int AS sessions
          FROM analytics_events
          WHERE created_at >= $1
          GROUP BY 1, 2
          ORDER BY 1 DESC, 3 DESC, 2
        `,
        [since.toISOString()],
      ),
      pool.query(
        `
          SELECT user_id,
                 COUNT(DISTINCT metadata->>'questionId') FILTER (
                   WHERE event_type = 'question_answered'
                     AND COALESCE(metadata->>'questionId', '') <> ''
                 )::int AS distinct_answered,
                 COUNT(*) FILTER (WHERE event_type = 'question_answered')::int AS total_answer_events
          FROM analytics_events
          WHERE created_at >= $1
          GROUP BY 1
          ORDER BY 2 DESC, 1
        `,
        [since.toISOString()],
      ),
      pool.query(
        `
          SELECT user_id, MAX(DATE(created_at)) AS last_seen
          FROM analytics_events
          WHERE created_at >= $1
          GROUP BY 1
          ORDER BY 2 DESC, 1
        `,
        [since.toISOString()],
      ),
      pool.query(
        `
          SELECT user_id, COUNT(*)::int AS total_questions
          FROM analytics_events
          WHERE created_at >= $1
            AND event_type = 'question_answered'
          GROUP BY 1
          ORDER BY 2 DESC, 1
        `,
        [since.toISOString()],
      ),
    ]);

  return {
    days,
    since,
    questionCount,
    dau: dauResult.rows.map((row) => ({
      day: formatDay(row.day),
      dau: Number(row.dau),
    })),
    questionsPerUserPerDay: questionsResult.rows.map((row) => ({
      day: formatDay(row.day),
      userId: row.user_id,
      questions: Number(row.questions),
    })),
    dayOverDayRetention: retentionResult.rows.map((row) => {
      const activeUsers = Number(row.active_users);
      const retainedUsers = Number(row.retained_users);
      return {
        day: formatDay(row.day),
        activeUsers,
        retainedUsers,
        retentionRate: activeUsers === 0 ? 0 : Math.round((retainedUsers / activeUsers) * 100),
      };
    }),
    sessionsPerUserPerDay: sessionsResult.rows.map((row) => ({
      day: formatDay(row.day),
      userId: row.user_id,
      sessions: Number(row.sessions),
    })),
    completionByUser: completionResult.rows.map((row) => ({
      userId: row.user_id,
      distinctAnswered: Number(row.distinct_answered),
      totalAnswerEvents: Number(row.total_answer_events),
      completionRate: questionCount === 0 ? 0 : Math.round((Number(row.distinct_answered) / questionCount) * 100),
    })),
    dropoffByUser: dropoffResult.rows.map((row) => ({
      userId: row.user_id,
      lastSeen: formatDay(row.last_seen),
    })),
    leaderboard: leaderboardResult.rows.map((row) => ({
      userId: row.user_id,
      totalQuestions: Number(row.total_questions),
    })),
  };
}

export function renderAdminDashboard(data) {
  const summaryCards = [
    ["Beta window", `${data.days} days`],
    ["Tracked users", String(new Set(data.dropoffByUser.map((row) => row.userId)).size)],
    ["Catalog size", `${data.questionCount} questions`],
    ["Since", formatDay(data.since)],
  ]
    .map(
      ([label, value]) =>
        `<article class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`,
    )
    .join("");

  const dauRows = data.dau.map((row) => [row.day, row.dau]);
  const questionRows = data.questionsPerUserPerDay.map((row) => [row.day, row.userId, row.questions]);
  const retentionRows = data.dayOverDayRetention.map((row) => [row.day, row.activeUsers, row.retainedUsers, `${row.retentionRate}%`]);
  const sessionRows = data.sessionsPerUserPerDay.map((row) => [row.day, row.userId, row.sessions]);
  const completionRows = getCompletionRows(data.completionByUser, data.questionCount);
  const dropoffRows = data.dropoffByUser.map((row) => [row.userId, row.lastSeen]);
  const leaderboardRows = data.leaderboard.map((row) => [row.userId, row.totalQuestions]);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>6123 Study Dashboard Admin</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7fb;
        --panel: #ffffff;
        --line: #d7dfeb;
        --text: #1d2433;
        --muted: #63708b;
        --accent: #0f766e;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .shell {
        max-width: 1280px;
        margin: 0 auto;
        padding: 32px 24px 56px;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: end;
        margin-bottom: 24px;
      }
      h1, h2 {
        margin: 0;
      }
      .eyebrow {
        margin: 0 0 6px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        font-weight: 700;
      }
      .summary-grid, .panel-grid {
        display: grid;
        gap: 16px;
      }
      .summary-grid {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        margin-bottom: 24px;
      }
      .panel-grid {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      }
      .summary-card, .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 18px 20px;
        box-shadow: 0 14px 30px rgba(15, 23, 42, 0.05);
      }
      .summary-card span {
        display: block;
        color: var(--muted);
        font-size: 13px;
        margin-bottom: 8px;
      }
      .summary-card strong {
        font-size: 28px;
      }
      .panel h2 {
        font-size: 18px;
        margin-bottom: 14px;
      }
      .table-wrap {
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }
      th, td {
        text-align: left;
        padding: 10px 0;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }
      .empty-card {
        padding: 16px;
        border-radius: 14px;
        background: #f8fafc;
        color: var(--muted);
      }
      .controls {
        color: var(--muted);
        font-size: 14px;
      }
      .controls a {
        color: var(--accent);
        text-decoration: none;
        font-weight: 600;
      }
      @media (max-width: 720px) {
        header { align-items: start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header>
        <div>
          <p class="eyebrow">Internal Beta Analytics</p>
          <h1>6123 Study Dashboard Admin</h1>
        </div>
        <div class="controls">Adjust range with <code>?days=10</code> on the URL.</div>
      </header>

      <section class="summary-grid">${summaryCards}</section>

      <section class="panel-grid">
        <section class="panel">
          <h2>Daily Active Users</h2>
          ${renderTable(["Day", "DAU"], dauRows, "No analytics events have been recorded yet.")}
        </section>

        <section class="panel">
          <h2>Questions Per User Per Day</h2>
          ${renderTable(["Day", "User", "Questions"], questionRows, "No answered questions in this window yet.")}
        </section>

        <section class="panel">
          <h2>Day-over-Day Retention</h2>
          ${renderTable(["Day", "Active users", "Retained next day", "Retention"], retentionRows, "Retention will appear after at least two active days.")}
        </section>

        <section class="panel">
          <h2>Sessions Per User Per Day</h2>
          ${renderTable(["Day", "User", "Sessions"], sessionRows, "No tracked sessions in this window yet.")}
        </section>

        <section class="panel">
          <h2>Completion Rate By User</h2>
          ${renderTable(["User", "Distinct answered", "Total questions", "Completion", "Answer events"], completionRows, "No completion data yet.")}
        </section>

        <section class="panel">
          <h2>Drop-off Day</h2>
          ${renderTable(["User", "Last active day"], dropoffRows, "No active users yet.")}
        </section>

        <section class="panel">
          <h2>Leaderboard</h2>
          ${renderTable(["User", "Total answered"], leaderboardRows, "No answered questions yet.")}
        </section>
      </section>
    </main>
  </body>
</html>`;
}
