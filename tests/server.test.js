import assert from "node:assert/strict";
import test from "node:test";

import {
  forwardFeedbackToDiscord,
  handleAdminDashboardRequest,
  handleAnalyticsRequest,
  validateFeedbackPayload,
} from "../server.js";
import {
  fetchAdminDashboardData,
  renderAdminDashboard,
  verifyAdminAuthHeader,
  validateAnalyticsPayload,
} from "../src/serverAnalytics.js";

test("feedback validation rejects empty messages", () => {
  const result = validateFeedbackPayload({ message: "   " });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
});

test("feedback validation trims and preserves metadata", () => {
  const result = validateFeedbackPayload({
    message: "  Hello Discord  ",
    profileName: " erik ",
    view: "dashboard",
    questionId: "part-1-q1",
    questionTitle: "Part 1 Question 1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.message, "Hello Discord");
  assert.equal(result.value.profileName, "erik");
  assert.equal(result.value.view, "dashboard");
});

test("feedback forwarding fails cleanly when webhook is missing", async () => {
  const result = await forwardFeedbackToDiscord(
    { message: "Hello", profileName: "erik", view: "study", questionId: "", questionTitle: "" },
    "",
    async () => ({ ok: true }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 503);
});

test("feedback forwarding sends a discord payload", async () => {
  let capturedRequest = null;

  const result = await forwardFeedbackToDiscord(
    {
      message: "Found a bug",
      profileName: "erik",
      view: "catalog",
      questionId: "part-2-q3",
      questionTitle: "Part 2 Question 3",
    },
    "https://discord.example/webhook",
    async (url, request) => {
      capturedRequest = { url, request };
      return { ok: true };
    },
  );

  assert.equal(result.ok, true);
  assert.equal(capturedRequest.url, "https://discord.example/webhook");
  const body = JSON.parse(capturedRequest.request.body);
  assert.match(body.content, /New Study Dashboard Feedback/);
  assert.match(body.content, /Profile:\*\* erik/);
  assert.match(body.content, /catalog/);
  assert.match(body.content, /Found a bug/);
});

test("analytics validation rejects unsupported events", () => {
  const result = validateAnalyticsPayload({
    userId: "profile-1",
    sessionId: "session-1",
    eventType: "unknown_event",
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
});

test("analytics validation trims required fields", () => {
  const result = validateAnalyticsPayload({
    userId: " profile-1 ",
    sessionId: " session-1 ",
    eventType: "question_answered",
    metadata: { questionId: "part-1-q1" },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.userId, "profile-1");
  assert.equal(result.value.sessionId, "session-1");
});

test("analytics request inserts events into postgres when configured", async () => {
  const writes = [];
  const pool = {
    async query(sql, params) {
      writes.push({ sql, params });
      return { rows: [] };
    },
  };
  const request = {
    method: "POST",
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({
        userId: "profile-1",
        sessionId: "session-1",
        eventType: "question_answered",
        metadata: { questionId: "part-1-q1", outcome: "correct" },
      }));
    },
  };
  const response = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };

  await handleAnalyticsRequest(request, response, { pool });

  assert.equal(response.statusCode, 202);
  assert.equal(writes.length, 6);
  assert.match(writes[writes.length - 1].sql, /INSERT INTO analytics_events/);
});

test("basic auth rejects invalid admin credentials", () => {
  const authHeader = `Basic ${Buffer.from("erik:wrong").toString("base64")}`;
  const result = verifyAdminAuthHeader(authHeader, {
    ADMIN_USER: "erik",
    ADMIN_PASS: "secret",
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 401);
});

test("fetchAdminDashboardData computes beta metrics from query rows", async () => {
  const responses = [
    { rows: [{ day: "2026-03-10", dau: 3 }] },
    { rows: [{ day: "2026-03-10", user_id: "profile-1", questions: 8 }] },
    { rows: [{ day: "2026-03-10", active_users: 3, retained_users: 2 }] },
    { rows: [{ day: "2026-03-10", user_id: "profile-1", sessions: 2 }] },
    { rows: [{ user_id: "profile-1", distinct_answered: 12, total_answer_events: 18 }] },
    { rows: [{ user_id: "profile-1", last_seen: "2026-03-10" }] },
    { rows: [{ user_id: "profile-1", total_questions: 18 }] },
  ];
  const pool = {
    query: async (sql) => {
      if (String(sql).trim().startsWith("CREATE ")) {
        return { rows: [] };
      }

      return responses.shift();
    },
  };

  const result = await fetchAdminDashboardData(pool, {
    days: 10,
    questionCount: 66,
    now: new Date("2026-03-10T12:00:00Z"),
  });

  assert.equal(result.dau[0].dau, 3);
  assert.equal(result.questionsPerUserPerDay[0].questions, 8);
  assert.equal(result.dayOverDayRetention[0].retentionRate, 67);
  assert.equal(result.sessionsPerUserPerDay[0].sessions, 2);
  assert.equal(result.completionByUser[0].completionRate, 18);
  assert.equal(result.dropoffByUser[0].lastSeen, "2026-03-10");
  assert.equal(result.leaderboard[0].totalQuestions, 18);
});

test("admin dashboard requires authentication", async () => {
  const request = {
    headers: {},
    url: "/admin",
  };
  const response = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };

  await handleAdminDashboardRequest(request, response, {
    env: {
      ADMIN_USER: "erik",
      ADMIN_PASS: "secret",
    },
  });

  assert.equal(response.statusCode, 401);
  assert.match(response.body, /Authentication required/);
});

test("admin dashboard renders chart panels", () => {
  const html = renderAdminDashboard({
    days: 10,
    since: new Date("2026-03-01T00:00:00Z"),
    questionCount: 66,
    dau: [
      { day: "2026-03-01", dau: 2 },
      { day: "2026-03-02", dau: 4 },
    ],
    questionsPerUserPerDay: [
      { day: "2026-03-01", userId: "profile-1", questions: 3 },
      { day: "2026-03-02", userId: "profile-1", questions: 6 },
    ],
    dayOverDayRetention: [],
    sessionsPerUserPerDay: [],
    completionByUser: [],
    dropoffByUser: [{ userId: "profile-1", lastSeen: "2026-03-02" }],
    leaderboard: [],
  });

  assert.match(html, /Daily Active Users Trend/);
  assert.match(html, /Questions Answered Per Day/);
  assert.match(html, /<svg class="chart-svg"/);
});
