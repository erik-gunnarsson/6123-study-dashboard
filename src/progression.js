const LEVELS = [
  { emoji: "🐣", label: "Level 1", xpRequired: 0 },
  { emoji: "🐿️", label: "Level 2", xpRequired: 60 },
  { emoji: "🦊", label: "Level 3", xpRequired: 140 },
  { emoji: "🦁", label: "Level 4", xpRequired: 260 },
  { emoji: "🐉", label: "Level 5", xpRequired: 420 },
  { emoji: "🧙‍♂️", label: "Mastery", xpRequired: null },
];

const XP_BY_OUTCOME = {
  failed: 3,
  repeat: 5,
  correct: 8,
};

export function getLevelConfig() {
  return LEVELS;
}

export function getXpForAttempt(outcome) {
  return XP_BY_OUTCOME[outcome] ?? 0;
}

function countGreenQuestions(questionStatuses) {
  return questionStatuses.filter((question) => question.outcome === "correct").length;
}

export function computeProgressionStats({ attempts, questionStatuses }) {
  const xp = attempts.reduce((sum, attempt) => sum + getXpForAttempt(attempt.outcome), 0);
  const finalLevelIndex = LEVELS.length - 1;
  const preFinalLevels = LEVELS.slice(0, -1);
  const greenQuestions = countGreenQuestions(questionStatuses);
  const totalQuestions = questionStatuses.length;
  const allGreen = totalQuestions > 0 && greenQuestions === totalQuestions;

  let currentLevelIndex = 0;
  for (let index = 0; index < preFinalLevels.length; index += 1) {
    if (xp >= preFinalLevels[index].xpRequired) {
      currentLevelIndex = index;
    }
  }

  if (allGreen) {
    currentLevelIndex = finalLevelIndex;
  }

  const currentLevel = LEVELS[currentLevelIndex];
  const nextLevel = LEVELS[Math.min(currentLevelIndex + 1, finalLevelIndex)];
  const isFinalGateLocked = currentLevelIndex === finalLevelIndex - 1 && !allGreen;

  let progressPercent = 100;
  let progressLabel = "Mastered";
  let xpIntoLevel = xp;
  let xpForNextLevel = xp;

  if (currentLevelIndex < finalLevelIndex - 1) {
    const currentThreshold = currentLevel.xpRequired;
    const nextThreshold = nextLevel.xpRequired;
    const span = nextThreshold - currentThreshold;
    xpIntoLevel = xp - currentThreshold;
    xpForNextLevel = nextThreshold;
    progressPercent = span > 0 ? Math.min(100, Math.round((xpIntoLevel / span) * 100)) : 100;
    progressLabel = `${xp}/${nextThreshold} XP`;
  } else if (isFinalGateLocked) {
    xpIntoLevel = greenQuestions;
    xpForNextLevel = totalQuestions;
    progressPercent = totalQuestions > 0 ? Math.round((greenQuestions / totalQuestions) * 100) : 0;
    progressLabel = `${greenQuestions}/${totalQuestions} green to unlock ${LEVELS[finalLevelIndex].emoji}`;
  }

  return {
    xp,
    levels: LEVELS,
    currentLevelIndex,
    currentEmoji: currentLevel.emoji,
    currentLabel: currentLevel.label,
    nextEmoji: nextLevel.emoji,
    nextLabel: nextLevel.label,
    progressPercent,
    progressLabel,
    xpIntoLevel,
    xpForNextLevel,
    isFinalGateLocked,
    greenQuestions,
    totalQuestions,
    isWizardUnlocked: currentLevelIndex === finalLevelIndex,
  };
}
