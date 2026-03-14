function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function buildQuestionHistory(attempts) {
  return attempts.reduce((history, attempt) => {
    const entry = history.get(attempt.questionId) ?? [];
    entry.push(attempt);
    history.set(attempt.questionId, entry);
    return history;
  }, new Map());
}

export function scoreQuestion(question, attemptsForQuestion) {
  if (!attemptsForQuestion || attemptsForQuestion.length === 0) {
    return 7;
  }

  const lastAttempt = attemptsForQuestion.at(-1);
  const failedCount = attemptsForQuestion.filter((attempt) => attempt.outcome === "failed").length;
  const repeatCount = attemptsForQuestion.filter((attempt) => attempt.outcome === "repeat").length;
  const correctCount = attemptsForQuestion.filter((attempt) => attempt.outcome === "correct").length;

  let weight = 1;
  weight += failedCount * 3;
  weight += repeatCount * 2;
  weight += Math.max(0, 2 - correctCount);

  if (lastAttempt?.outcome === "failed") {
    weight += 3;
  } else if (lastAttempt?.outcome === "repeat") {
    weight += 2;
  } else if (lastAttempt?.outcome === "correct") {
    weight -= 1.5;
  }

  return clamp(weight, 0.5, 14);
}

export function getEligibleQuestions(catalog, sectionFilter = "all") {
  return catalog.questions.filter((question) => sectionFilter === "all" || question.section === sectionFilter);
}

export function pickNextQuestion({
  catalog,
  attempts,
  sectionFilter = "all",
  queueMode = "weighted",
  currentQuestionId = null,
  random = Math.random,
}) {
  const eligible = getEligibleQuestions(catalog, sectionFilter);

  if (eligible.length === 0) {
    return null;
  }

  if (queueMode === "ordered") {
    if (!currentQuestionId) {
      return eligible[0] ?? null;
    }

    const currentIndex = eligible.findIndex((question) => question.id === currentQuestionId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % eligible.length : 0;
    return eligible[nextIndex] ?? eligible[0] ?? null;
  }

  if (queueMode === "mixed") {
    const index = Math.floor(random() * eligible.length);
    return eligible[index] ?? eligible[0] ?? null;
  }

  const history = buildQuestionHistory(attempts);
  const weighted = eligible.map((question) => ({
    question,
    weight: scoreQuestion(question, history.get(question.id)),
  }));

  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = random() * totalWeight;

  for (const entry of weighted) {
    threshold -= entry.weight;

    if (threshold <= 0) {
      return entry.question;
    }
  }

  return weighted.at(-1)?.question ?? null;
}
