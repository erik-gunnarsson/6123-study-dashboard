import assert from "node:assert/strict";
import test from "node:test";

import { forwardFeedbackToDiscord, validateFeedbackPayload } from "../server.js";

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
