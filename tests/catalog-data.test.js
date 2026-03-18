import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/question-catalog.json", import.meta.url), "utf8"));

test("catalog keeps handbook ids and appends quiz sections", () => {
  const sectionIds = catalog.sections.map((section) => section.id);
  const questionIds = new Set(catalog.questions.map((question) => question.id));

  assert.deepEqual(sectionIds.slice(0, 7), [
    "part-1",
    "part-2",
    "part-3",
    "part-4",
    "part-5",
    "part-6",
    "part-7",
  ]);
  assert.equal(sectionIds.includes("quiz-1"), true);
  assert.equal(sectionIds.includes("quiz-2"), true);
  assert.equal(questionIds.has("part-1-q1"), true);
  assert.equal(questionIds.has("part-7-q3"), true);
});

test("catalog includes quiz 1 and quiz 2 questions", () => {
  const quiz1Questions = catalog.questions.filter((question) => question.section === "quiz-1");
  const quiz2Questions = catalog.questions.filter((question) => question.section === "quiz-2");

  assert.equal(quiz1Questions.length, 18);
  assert.equal(quiz2Questions.length, 20);
  assert.equal(quiz1Questions[0].solutionUrl, "https://sse.instructure.com/courses/2658/quizzes");
  assert.match(quiz2Questions[0].solutionText, /Self-check this quiz question in Canvas/i);
});
