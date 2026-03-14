import test from "node:test";
import assert from "node:assert/strict";

import { pickNextQuestion, scoreQuestion } from "../src/queue.js";

const catalog = {
  questions: [
    { id: "q1", section: "part-1" },
    { id: "q2", section: "part-1" },
    { id: "q3", section: "part-2" },
  ],
};

test("unseen questions get high default weight", () => {
  assert.equal(scoreQuestion(catalog.questions[0], []), 7);
});

test("failed questions get more weight than correct ones", () => {
  const failed = scoreQuestion(catalog.questions[0], [{ outcome: "failed" }]);
  const correct = scoreQuestion(catalog.questions[1], [{ outcome: "correct" }]);
  assert.ok(failed > correct);
});

test("question selection respects section filters", () => {
  const selected = pickNextQuestion({
    catalog,
    attempts: [],
    sectionFilter: "part-2",
    random: () => 0.1,
  });

  assert.equal(selected.id, "q3");
});
