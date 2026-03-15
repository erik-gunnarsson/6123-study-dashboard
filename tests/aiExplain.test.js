import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiExplainPrompt,
  getAiExplainLaunchStrategy,
  openAiExplain,
} from "../src/aiExplain.js";

const sampleQuestion = {
  sectionLabel: "Part 2: Interest Rates",
  title: "Problem 6",
  prompt: "Consider the following bank accounts and explain which one you prefer.",
  solutionText: "Compare effective annual rates and compute the future value over 3.5 years.",
};

test("buildAiExplainPrompt includes section, title, prompt, and solution context", () => {
  const prompt = buildAiExplainPrompt(sampleQuestion, { includeSolution: true });

  assert.match(prompt, /master's-level finance professor/);
  assert.match(prompt, /Part 2: Interest Rates/);
  assert.match(prompt, /Problem 6/);
  assert.match(prompt, /bank accounts/);
  assert.match(prompt, /Official solution context/);
});

test("launch strategy uses full prompt when url is within limits", () => {
  const result = getAiExplainLaunchStrategy(sampleQuestion);

  assert.equal(result.mode, "full");
  assert.match(result.url, /^https:\/\/chatgpt\.com\/\?prompt=/);
});

test("launch strategy falls back to clipboard when prompt remains too long", () => {
  const result = getAiExplainLaunchStrategy({
    ...sampleQuestion,
    prompt: "A".repeat(10_000),
    solutionText: "B".repeat(10_000),
  });

  assert.equal(result.mode, "clipboard");
  assert.equal(result.url, "https://chatgpt.com/");
});

test("openAiExplain copies prompt when clipboard fallback is needed", async () => {
  let openedUrl = "";
  let copiedText = "";

  const result = await openAiExplain({
    ...sampleQuestion,
    prompt: "A".repeat(10_000),
    solutionText: "B".repeat(10_000),
  }, {
    openWindow: (url) => {
      openedUrl = url;
    },
    clipboard: {
      async writeText(value) {
        copiedText = value;
      },
    },
  });

  assert.equal(result.mode, "clipboard");
  assert.equal(openedUrl, "https://chatgpt.com/");
  assert.match(copiedText, /Problem 6/);
});
