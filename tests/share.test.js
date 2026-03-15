import test from "node:test";
import assert from "node:assert/strict";

import { buildShareCardModel, renderShareCardSvg } from "../src/share.js";

test("share card model uses profile, progression, and question statuses", () => {
  const model = buildShareCardModel({
    profileName: "Erik",
    progression: {
      currentEmoji: "🐉",
      currentLabel: "Level 8",
      xp: 336,
    },
    questionStatuses: [
      { id: "q1", outcome: "correct", section: "part-1" },
      { id: "q2", outcome: "failed", section: "part-2" },
    ],
  });

  assert.equal(model.profileName, "Erik");
  assert.equal(model.currentEmoji, "🐉");
  assert.equal(model.currentLabel, "Level 8");
  assert.equal(model.xp, 336);
  assert.equal(model.questionStatuses.length, 2);
});

test("share card svg includes core share content", () => {
  const svg = renderShareCardSvg({
    profileName: "Erik",
    currentEmoji: "🐉",
    currentLabel: "Level 8",
    xp: 336,
    questionStatuses: [
      { id: "q1", outcome: "correct", section: "part-1" },
      { id: "q2", outcome: "repeat", section: "part-2" },
      { id: "q3", outcome: "failed", section: "part-3" },
    ],
  });

  assert.match(svg, /Erik/);
  assert.match(svg, /Level 8/);
  assert.match(svg, /336 XP earned/);
  assert.match(svg, /6123 Study Dashboard/);
  assert.match(svg, /width="1080"/);
  assert.match(svg, /height="1080"/);
  assert.match(svg, /fill="#10766E"/);
});
