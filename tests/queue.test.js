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

test("mixed mode selects uniformly from eligible questions", () => {
  const selected = pickNextQuestion({
    catalog,
    attempts: [],
    queueMode: "mixed",
    random: () => 0.51,
  });

  assert.equal(selected.id, "q2");
});

test("ordered mode walks through eligible questions in catalog order", () => {
  const first = pickNextQuestion({
    catalog,
    attempts: [],
    queueMode: "ordered",
  });
  const second = pickNextQuestion({
    catalog,
    attempts: [],
    queueMode: "ordered",
    currentQuestionId: "q1",
  });
  const wrapped = pickNextQuestion({
    catalog,
    attempts: [],
    queueMode: "ordered",
    currentQuestionId: "q3",
  });

  assert.equal(first.id, "q1");
  assert.equal(second.id, "q2");
  assert.equal(wrapped.id, "q1");
});
