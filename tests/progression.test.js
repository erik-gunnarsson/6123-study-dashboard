import test from "node:test";
import assert from "node:assert/strict";

import { computeProgressionStats, getXpForAttempt } from "../src/progression.js";

test("failing still earns xp, but less than repeat and correct", () => {
  assert.ok(getXpForAttempt("failed") > 0);
  assert.ok(getXpForAttempt("repeat") > getXpForAttempt("failed"));
  assert.ok(getXpForAttempt("correct") > getXpForAttempt("repeat"));
});

test("progression advances through xp levels before the final gate", () => {
  const attempts = [
    { outcome: "correct" },
    { outcome: "correct" },
    { outcome: "repeat" },
    { outcome: "failed" },
  ];
  const questionStatuses = [
    { outcome: "correct" },
    { outcome: "repeat" },
    { outcome: "unseen" },
  ];

  const progression = computeProgressionStats({ attempts, questionStatuses });

  assert.equal(progression.xp, 52);
  assert.equal(progression.currentEmoji, "🐿️");
  assert.equal(progression.nextEmoji, "🐈");
  assert.equal(progression.isFinalGateLocked, false);
});

test("wizard level requires all questions green", () => {
  const attempts = Array.from({ length: 25 }, () => ({ outcome: "correct" }));
  const locked = computeProgressionStats({
    attempts,
    questionStatuses: [{ outcome: "correct" }, { outcome: "repeat" }, { outcome: "correct" }],
  });
  const unlocked = computeProgressionStats({
    attempts,
    questionStatuses: [{ outcome: "correct" }, { outcome: "correct" }, { outcome: "correct" }],
  });

  assert.equal(locked.currentEmoji, "🐉");
  assert.equal(locked.isFinalGateLocked, true);
  assert.equal(unlocked.currentEmoji, "🧙‍♂️");
  assert.equal(unlocked.isWizardUnlocked, true);
});
