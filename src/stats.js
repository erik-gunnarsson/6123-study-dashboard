import { buildQuestionHistory, scoreQuestion } from "./queue.js";

function percentage(value, total) {
  if (total === 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

export function computeSectionStats(catalog, attempts) {
  const history = buildQuestionHistory(attempts);

  return catalog.sections.map((section) => {
    const questions = catalog.questions.filter((question) => question.section === section.id);
    const sectionAttempts = attempts.filter((attempt) =>
      questions.some((question) => question.id === attempt.questionId),
    );
    const correct = sectionAttempts.filter((attempt) => attempt.outcome === "correct").length;
    const failed = sectionAttempts.filter((attempt) => attempt.outcome === "failed").length;
    const repeat = sectionAttempts.filter((attempt) => attempt.outcome === "repeat").length;
    const answered = questions.filter((question) => history.has(question.id)).length;

    return {
      id: section.id,
      label: section.label,
      questionCount: questions.length,
      answered,
      accuracy: percentage(correct, sectionAttempts.length),
      correct,
      failed,
      repeat,
      averageWeight: Number(
        (
          questions.reduce((sum, question) => sum + scoreQuestion(question, history.get(question.id)), 0) /
          questions.length
        ).toFixed(2),
      ),
    };
  });
}

export function computeDashboardStats(catalog, attempts) {
  const history = buildQuestionHistory(attempts);
  const correct = attempts.filter((attempt) => attempt.outcome === "correct").length;
  const failed = attempts.filter((attempt) => attempt.outcome === "failed").length;
  const repeat = attempts.filter((attempt) => attempt.outcome === "repeat").length;
  const unanswered = catalog.questions.filter((question) => !history.has(question.id));
  const questionStatuses = catalog.questions.map((question) => {
    const questionAttempts = history.get(question.id) ?? [];
    const latestAttempt = [...questionAttempts].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

    return {
      id: question.id,
      title: question.title,
      section: question.section,
      sectionLabel: question.sectionLabel,
      outcome: latestAttempt?.outcome ?? "unseen",
      attempts: questionAttempts.length,
    };
  });
  const mostMissed = catalog.questions
    .map((question) => {
      const questionAttempts = history.get(question.id) ?? [];
      return {
        id: question.id,
        title: question.title,
        failed: questionAttempts.filter((attempt) => attempt.outcome === "failed").length,
        repeat: questionAttempts.filter((attempt) => attempt.outcome === "repeat").length,
        attempts: questionAttempts.length,
        sectionLabel: question.sectionLabel,
      };
    })
    .filter((question) => question.failed > 0 || question.repeat > 0)
    .sort((left, right) => right.failed - left.failed || right.repeat - left.repeat)
    .slice(0, 5);

  return {
    totalQuestions: catalog.questions.length,
    attemptsCount: attempts.length,
    accuracy: percentage(correct, attempts.length),
    correct,
    failed,
    repeat,
    unanswered,
    questionStatuses,
    sectionStats: computeSectionStats(catalog, attempts),
    recentAttempts: [...attempts]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8),
    mostMissed,
  };
}
