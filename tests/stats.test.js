import test from "node:test";
import assert from "node:assert/strict";

import { computeDashboardStats } from "../src/stats.js";

const catalog = {
  sections: [
    { id: "part-1", label: "Part 1" },
    { id: "part-2", label: "Part 2" },
  ],
  questions: [
    { id: "q1", title: "Q1", section: "part-1", sectionLabel: "Part 1", sourceRef: "ref-1" },
    { id: "q2", title: "Q2", section: "part-1", sectionLabel: "Part 1", sourceRef: "ref-2" },
    { id: "q3", title: "Q3", section: "part-2", sectionLabel: "Part 2", sourceRef: "ref-3" },
  ],
};

test("dashboard stats summarize attempts and unanswered questions", () => {
  const stats = computeDashboardStats(catalog, [
    { questionId: "q1", outcome: "correct", createdAt: "2026-03-13T10:00:00.000Z" },
    { questionId: "q2", outcome: "failed", createdAt: "2026-03-13T11:00:00.000Z" },
    { questionId: "q2", outcome: "repeat", createdAt: "2026-03-13T12:00:00.000Z" },
  ]);

  assert.equal(stats.attemptsCount, 3);
  assert.equal(stats.accuracy, 33);
  assert.equal(stats.unanswered.length, 1);
  assert.equal(stats.mostMissed[0].id, "q2");
  assert.equal(stats.questionStatuses.find((question) => question.id === "q1").section, "part-1");
  assert.equal(stats.questionStatuses.find((question) => question.id === "q1").outcome, "correct");
  assert.equal(stats.questionStatuses.find((question) => question.id === "q2").outcome, "repeat");
  assert.equal(stats.questionStatuses.find((question) => question.id === "q3").outcome, "unseen");
});
