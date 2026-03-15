import assert from "node:assert/strict";
import test from "node:test";

import { loadAnalyticsSession, sendAnalyticsEvent, touchAnalyticsSession } from "../src/analytics.js";

function createStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("touchAnalyticsSession reuses an active session", () => {
  const storage = createStorage();
  const first = touchAnalyticsSession({ storage, userId: "profile-1", now: 1_000 });
  const second = touchAnalyticsSession({ storage, userId: "profile-1", now: 1_500 });

  assert.equal(first.startedNewSession, true);
  assert.equal(second.startedNewSession, false);
  assert.equal(first.sessionId, second.sessionId);
});

test("touchAnalyticsSession rolls over after inactivity", () => {
  const storage = createStorage();
  const first = touchAnalyticsSession({ storage, userId: "profile-1", now: 1_000 });
  const second = touchAnalyticsSession({ storage, userId: "profile-1", now: 1_000 + (31 * 60 * 1000) });

  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(second.startedNewSession, true);
});

test("loadAnalyticsSession returns null for invalid state", () => {
  const storage = createStorage();
  storage.setItem("studyprep-analytics-session:profile-1", "{not-json");

  assert.equal(loadAnalyticsSession(storage, "profile-1"), null);
});

test("sendAnalyticsEvent emits session_start and the requested event", async () => {
  const storage = createStorage();
  const calls = [];

  const result = await sendAnalyticsEvent({
    userId: "profile-1",
    eventType: "question_answered",
    metadata: { questionId: "part-1-q1" },
    storage,
    now: 10_000,
    fetchImpl: async (url, request) => {
      calls.push({ url, request: JSON.parse(request.body) });
      return { ok: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].request.eventType, "session_start");
  assert.equal(calls[1].request.eventType, "question_answered");
  assert.equal(calls[1].request.metadata.questionId, "part-1-q1");
});
