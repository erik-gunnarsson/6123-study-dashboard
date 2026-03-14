import { loadCatalog, buildSectionOptions, getQuestionById } from "./catalog.js";
import {
  getProfiles,
  saveProfile,
  getAttemptsForProfile,
  saveAttempt,
  setActiveProfileId,
  getActiveProfileId,
  exportState,
  importState,
  deleteAttemptsForProfile,
  getQueueMode,
  setQueueMode,
} from "./storage.js";
import { pickNextQuestion } from "./queue.js";
import { computeDashboardStats } from "./stats.js";
import { createAttempt, createProfile } from "./types.js";

const state = {
  catalog: null,
  profiles: [],
  activeProfileId: getActiveProfileId(),
  attempts: [],
  activeQuestion: null,
  sectionFilter: "all",
  queueMode: getQueueMode(),
  selectedView: "study",
};

const elements = {
  matrixTooltip: document.querySelector("#matrix-tooltip"),
  onboardingOverlay: document.querySelector("#onboarding-overlay"),
  onboardingForm: document.querySelector("#onboarding-form"),
  onboardingName: document.querySelector("#onboarding-name"),
  catalogSummary: document.querySelector("#catalog-summary"),
  profileCount: document.querySelector("#profile-count"),
  profileList: document.querySelector("#profile-list"),
  profileForm: document.querySelector("#profile-form"),
  profileName: document.querySelector("#profile-name"),
  activeProfileName: document.querySelector("#active-profile-name"),
  activeProfileCopy: document.querySelector("#active-profile-copy"),
  feedbackForm: document.querySelector("#feedback-form"),
  feedbackMessage: document.querySelector("#feedback-message"),
  feedbackSubmit: document.querySelector("#feedback-submit"),
  feedbackStatus: document.querySelector("#feedback-status"),
  sectionFilter: document.querySelector("#section-filter"),
  queueMode: document.querySelector("#queue-mode"),
  queueModeLabel: document.querySelector("#queue-mode-label"),
  nextQuestion: document.querySelector("#next-question"),
  nextQuestionInline: document.querySelector("#next-question-inline"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  resetProfile: document.querySelector("#reset-profile"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  views: {
    study: document.querySelector("#study-view"),
    dashboard: document.querySelector("#dashboard-view"),
    catalog: document.querySelector("#catalog-view"),
  },
  emptyState: document.querySelector("#empty-state"),
  questionCard: document.querySelector("#question-card"),
  questionBadge: document.querySelector("#question-badge"),
  questionSection: document.querySelector("#question-section"),
  questionStatus: document.querySelector("#question-status"),
  questionSource: document.querySelector("#question-source"),
  questionTitle: document.querySelector("#question-title"),
  questionPrompt: document.querySelector("#question-prompt"),
  questionPromptNote: document.querySelector("#question-prompt-note"),
  toggleSolution: document.querySelector("#toggle-solution"),
  solutionPanel: document.querySelector("#solution-panel"),
  solutionRef: document.querySelector("#solution-ref"),
  solutionText: document.querySelector("#solution-text"),
  attemptForm: document.querySelector("#attempt-form"),
  attemptNote: document.querySelector("#attempt-note"),
  dashboardCards: document.querySelector("#dashboard-cards"),
  sidebarQuestionMatrix: document.querySelector("#sidebar-question-matrix"),
  questionMatrix: document.querySelector("#question-matrix"),
  sectionStats: document.querySelector("#section-stats"),
  recentAttempts: document.querySelector("#recent-attempts"),
  mostMissed: document.querySelector("#most-missed"),
  unansweredList: document.querySelector("#unanswered-list"),
  catalogCount: document.querySelector("#catalog-count"),
  catalogList: document.querySelector("#catalog-list"),
  metricCardTemplate: document.querySelector("#metric-card-template"),
};

let activeTooltipAnchor = null;

function setFeedbackStatus(message = "", tone = "") {
  elements.feedbackStatus.textContent = message;
  elements.feedbackStatus.className = `feedback-status${message ? "" : " hidden"}${tone ? ` is-${tone}` : ""}`;
}

function getActiveProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null;
}

function setView(view) {
  state.selectedView = view;

  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle("is-active", isActive);
  });

  Object.entries(elements.views).forEach(([key, element]) => {
    const active = key === view;
    element.classList.toggle("hidden", !active);
    element.classList.toggle("is-active", active);
  });
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getLatestAttemptForQuestion(questionId) {
  return [...state.attempts]
    .filter((attempt) => attempt.questionId === questionId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function formatOutcomeLabel(outcome) {
  const labels = {
    correct: "Correct",
    failed: "Failed",
    repeat: "Repeat",
    unseen: "Unseen",
  };

  return labels[outcome] ?? "Unseen";
}

function getQuestionHoverLabel(question) {
  const match = question.title.match(/Question\s+(\d+)/i);
  const questionNumber = match ? `Q${match[1]}` : question.title;
  const sectionName = question.sectionLabel.split(":")[0] ?? question.sectionLabel;
  return `${sectionName} · ${questionNumber}`;
}

function hideMatrixTooltip() {
  activeTooltipAnchor = null;
  elements.matrixTooltip.classList.add("hidden");
  elements.matrixTooltip.setAttribute("aria-hidden", "true");
}

function positionMatrixTooltip(anchorRect) {
  const tooltip = elements.matrixTooltip;
  const offset = 10;
  const maxLeft = window.innerWidth - tooltip.offsetWidth - 8;
  const preferredLeft = anchorRect.left + anchorRect.width / 2 - tooltip.offsetWidth / 2;
  const left = Math.min(Math.max(8, preferredLeft), Math.max(8, maxLeft));

  let top = anchorRect.top - tooltip.offsetHeight - offset;
  if (top < 8) {
    top = anchorRect.bottom + offset;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showMatrixTooltip(label, anchorElement) {
  if (!label || !anchorElement) {
    return;
  }

  activeTooltipAnchor = anchorElement;
  elements.matrixTooltip.textContent = label;
  elements.matrixTooltip.classList.remove("hidden");
  elements.matrixTooltip.setAttribute("aria-hidden", "false");
  positionMatrixTooltip(anchorElement.getBoundingClientRect());
}

function getSectionBadgeClass(sectionValue) {
  if (!sectionValue) {
    return "";
  }

  if (sectionValue.startsWith("part-")) {
    return `section-badge ${sectionValue}`;
  }

  const match = sectionValue.match(/Part\s+(\d+)/i);
  return match ? `section-badge part-${match[1]}` : "";
}

function getSectionMatrixColors(section) {
  const palette = {
    "part-1": { marker: "#0ea5e9" },
    "part-2": { marker: "#8b5cf6" },
    "part-3": { marker: "#14b8a6" },
    "part-4": { marker: "#f97316" },
    "part-5": { marker: "#eab308" },
    "part-6": { marker: "#ec4899" },
    "part-7": { marker: "#6366f1" },
  };

  return palette[section] ?? { marker: "#9ca3af" };
}

function openQuestion(questionId) {
  if (!getActiveProfile()) {
    return;
  }

  const question = getQuestionById(state.catalog, questionId);

  if (!question) {
    return;
  }

  state.activeQuestion = question;
  setView("study");
  renderQuestion();
}

async function createAndActivateProfile(name) {
  const normalized = name.trim();

  if (!normalized) {
    return;
  }

  const profile = createProfile(normalized);
  await saveProfile(profile);
  state.profiles = [...state.profiles, profile];
  state.activeProfileId = profile.id;
  state.attempts = [];
  setActiveProfileId(profile.id);
}

function openFirstQuestion() {
  const firstQuestion = getQuestionById(state.catalog, "part-1-q1") ?? state.catalog?.questions?.[0] ?? null;

  if (!firstQuestion) {
    return;
  }

  state.activeQuestion = firstQuestion;
  setView("study");
}

function createListCard(title, body, rightLabel = "", rightLabelKey = "") {
  const item = document.createElement("article");
  item.className = "list-card";
  item.innerHTML = `
    <div class="list-card-head">
      <strong>${title}</strong>
      ${rightLabel ? `<span class="pill subtle list-card-label ${getSectionBadgeClass(rightLabelKey || rightLabel)}">${rightLabel}</span>` : ""}
    </div>
    <p>${body}</p>
  `;
  return item;
}

function renderProfiles() {
  const activeProfile = getActiveProfile();
  elements.profileCount.textContent = `${state.profiles.length} user${state.profiles.length === 1 ? "" : "s"}`;
  elements.profileList.replaceChildren();

  if (state.profiles.length === 0) {
    elements.profileList.appendChild(createListCard("No profiles yet", "Create one to start tracking progress."));
    return;
  }

  state.profiles
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((profile) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "profile-card";
      card.classList.toggle("is-active", activeProfile?.id === profile.id);
      card.innerHTML = `
        <header>
          <strong>${profile.name}</strong>
          <span class="pill subtle">${activeProfile?.id === profile.id ? "Active" : "Select"}</span>
        </header>
        <p>Created ${formatTimestamp(profile.createdAt)}</p>
      `;
      card.addEventListener("click", async () => {
        state.activeProfileId = profile.id;
        setActiveProfileId(profile.id);
        state.attempts = await getAttemptsForProfile(profile.id);
        state.activeQuestion = null;
        render();
      });
      elements.profileList.appendChild(card);
    });
}

function renderActiveProfile() {
  const activeProfile = getActiveProfile();

  if (!activeProfile) {
    elements.activeProfileName.textContent = "No profile selected";
    elements.activeProfileCopy.textContent = "Open Settings to create or switch profiles.";
    return;
  }

  elements.activeProfileName.textContent = activeProfile.name;
  elements.activeProfileCopy.textContent = `${state.attempts.length} attempt${state.attempts.length === 1 ? "" : "s"} saved in this browser.`;
}

function getFeedbackPayload() {
  const activeProfile = getActiveProfile();

  return {
    message: elements.feedbackMessage.value.trim(),
    profileName: activeProfile?.name ?? "",
    view: state.selectedView,
    questionId: state.activeQuestion?.id ?? "",
    questionTitle: state.activeQuestion?.title ?? "",
  };
}

function renderOnboarding() {
  const shouldShow = !getActiveProfile();
  document.body.classList.toggle("onboarding-active", shouldShow);
  elements.onboardingOverlay.classList.toggle("hidden", !shouldShow);
  elements.onboardingOverlay.setAttribute("aria-hidden", String(!shouldShow));

  if (shouldShow) {
    queueMicrotask(() => elements.onboardingName.focus());
  }
}

function renderSectionFilter() {
  elements.sectionFilter.replaceChildren();

  buildSectionOptions(state.catalog).forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    if (option.value === state.sectionFilter) {
      element.selected = true;
    }
    elements.sectionFilter.appendChild(element);
  });

  const queueModeLabels = {
    weighted: "Mixed weighted",
    mixed: "Mixed",
    ordered: "In order",
  };

  elements.queueMode.value = state.queueMode;
  elements.queueModeLabel.textContent = queueModeLabels[state.queueMode] ?? "Mixed weighted";
}

function renderQuestion() {
  const question = state.activeQuestion;
  const hasActiveProfile = Boolean(getActiveProfile());
  const showQuestion = Boolean(question && hasActiveProfile);

  elements.emptyState.classList.toggle("hidden", showQuestion);
  elements.questionCard.classList.toggle("hidden", !showQuestion);
  elements.questionBadge.textContent = showQuestion ? "Ready to solve" : hasActiveProfile ? "Waiting" : "Pick a user";

  if (!showQuestion) {
    return;
  }

  elements.questionSection.textContent = question.sectionLabel;
  elements.questionSection.className = `pill ${getSectionBadgeClass(question.section)}`;
  const latestAttempt = getLatestAttemptForQuestion(question.id);
  elements.questionStatus.textContent = formatOutcomeLabel(latestAttempt?.outcome ?? "unseen");
  elements.questionStatus.className = `pill subtle question-status is-${latestAttempt?.outcome ?? "unseen"}`;
  elements.questionSource.textContent = question.sourceRef;
  elements.questionTitle.textContent = question.title;
  elements.questionPrompt.textContent = question.prompt;
  const promptNote = question.promptStatus === "placeholder"
    ? "Prompt text is a placeholder. Use the handbook PDF for the full original wording while the curated catalog gets refined."
    : "";
  elements.questionPromptNote.textContent = promptNote;
  elements.questionPromptNote.classList.toggle("hidden", !promptNote);
  elements.solutionRef.textContent = question.solutionRef;
  elements.solutionText.textContent = question.solutionText;
  elements.solutionPanel.classList.add("hidden");
  elements.toggleSolution.textContent = "Reveal solution";
  elements.attemptNote.value = "";
}

function renderDashboard() {
  elements.sidebarQuestionMatrix.replaceChildren();
  elements.questionMatrix.replaceChildren();
  elements.dashboardCards.replaceChildren();
  elements.sectionStats.replaceChildren();
  elements.recentAttempts.replaceChildren();
  elements.mostMissed.replaceChildren();
  elements.unansweredList.replaceChildren();

  if (!state.catalog || !getActiveProfile()) {
    return;
  }

  const stats = computeDashboardStats(state.catalog, state.attempts);
  const metricData = [
    { label: "Questions", value: stats.totalQuestions, footnote: "Seeded from the handbook solutions workbook" },
    { label: "Attempts", value: stats.attemptsCount, footnote: "Saved locally in this browser" },
    { label: "Accuracy", value: `${stats.accuracy}%`, footnote: `${stats.correct} correct / ${stats.failed} failed / ${stats.repeat} repeat` },
    { label: "Unanswered", value: stats.unanswered.length, footnote: "Questions with no logged attempts yet" },
  ];

  metricData.forEach((metric) => {
    const fragment = elements.metricCardTemplate.content.cloneNode(true);
    fragment.querySelector(".metric-label").textContent = metric.label;
    fragment.querySelector(".metric-value").textContent = metric.value;
    fragment.querySelector(".metric-footnote").textContent = metric.footnote;
    elements.dashboardCards.appendChild(fragment);
  });

  stats.questionStatuses.forEach((question, index) => {
    const buildCell = (compact = false) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `matrix-cell is-${question.outcome} section-cell ${question.section}${compact ? " is-compact" : ""}`;
      const hoverLabel = getQuestionHoverLabel(question);
      const sectionColors = getSectionMatrixColors(question.section);
      cell.setAttribute("aria-label", hoverLabel);
      cell.style.setProperty("--section-marker", sectionColors.marker);
      cell.textContent = index + 1;
      cell.addEventListener("click", () => openQuestion(question.id));
      cell.addEventListener("mouseenter", () => showMatrixTooltip(hoverLabel, cell));
      cell.addEventListener("mouseleave", hideMatrixTooltip);
      cell.addEventListener("focus", () => showMatrixTooltip(hoverLabel, cell));
      cell.addEventListener("blur", hideMatrixTooltip);
      return cell;
    };

    elements.questionMatrix.appendChild(buildCell(false));
    elements.sidebarQuestionMatrix.appendChild(buildCell(true));
  });

  stats.sectionStats.forEach((section) => {
    const row = document.createElement("article");
    row.className = "section-row";
    row.innerHTML = `
      <header>
        <strong>${section.label}</strong>
        <span class="pill subtle">${section.answered}/${section.questionCount} seen</span>
      </header>
      <div class="progress-bar"><span style="width:${section.accuracy}%"></span></div>
      <p>${section.accuracy}% accuracy. ${section.failed} failed, ${section.repeat} repeat, priority score ${section.averageWeight}.</p>
    `;
    elements.sectionStats.appendChild(row);
  });

  if (stats.recentAttempts.length === 0) {
    elements.recentAttempts.appendChild(createListCard("No attempts yet", "Log your first question to populate the dashboard."));
  } else {
    stats.recentAttempts.forEach((attempt) => {
      const question = getQuestionById(state.catalog, attempt.questionId);
      const item = createListCard(
        question?.title ?? attempt.questionId,
        `${attempt.outcome.toUpperCase()} on ${formatTimestamp(attempt.createdAt)}${attempt.note ? ` - ${attempt.note}` : ""}`,
        question?.sectionLabel ?? "",
        question?.section ?? question?.sectionLabel ?? "",
      );
      item.classList.add("is-clickable");
      item.addEventListener("click", () => openQuestion(attempt.questionId));
      elements.recentAttempts.appendChild(item);
    });
  }

  if (stats.mostMissed.length === 0) {
    elements.mostMissed.appendChild(createListCard("No weak spots yet", "Questions marked failed or repeat will surface here."));
  } else {
    stats.mostMissed.forEach((question) => {
      const item = createListCard(
        question.title,
        `${question.failed} failed and ${question.repeat} repeat outcomes across ${question.attempts} attempts.`,
        question.sectionLabel,
        question.sectionLabel,
      );
      item.classList.add("is-clickable");
      item.addEventListener("click", () => openQuestion(question.id));
      elements.mostMissed.appendChild(item);
    });
  }

  if (stats.unanswered.length === 0) {
    elements.unansweredList.appendChild(createListCard("Everything has been touched", "You have at least one attempt logged for every seeded question."));
  } else {
    stats.unanswered.slice(0, 8).forEach((question) => {
      const item = createListCard(question.title, question.sourceRef, question.sectionLabel, question.section);
      item.classList.add("is-clickable");
      item.addEventListener("click", () => openQuestion(question.id));
      elements.unansweredList.appendChild(item);
    });
  }
}

function renderCatalog() {
  elements.catalogCount.textContent = `${state.catalog.questions.length} questions`;
  elements.catalogList.replaceChildren();

  state.catalog.questions.forEach((question) => {
    const latestAttempt = getLatestAttemptForQuestion(question.id);
    const item = document.createElement("article");
    item.className = "catalog-item";
    item.innerHTML = `
      <header>
        <strong>${question.title}</strong>
        <span class="pill subtle ${getSectionBadgeClass(question.section)}">${question.sectionLabel}</span>
      </header>
      <div class="catalog-actions">
        <span class="pill subtle question-status is-${latestAttempt?.outcome ?? "unseen"}">${formatOutcomeLabel(latestAttempt?.outcome ?? "unseen")}</span>
        <button type="button" class="open-question-button">Open</button>
      </div>
      <p>${question.prompt}</p>
      <p><strong>Source:</strong> ${question.sourceRef}</p>
      <p><strong>Solution:</strong> ${question.solutionRef}</p>
    `;
    item.querySelector(".open-question-button").addEventListener("click", () => openQuestion(question.id));
    elements.catalogList.appendChild(item);
  });
}

function render() {
  if (!state.catalog) {
    return;
  }

  const activeProfile = getActiveProfile();
  elements.catalogSummary.textContent = `${state.catalog.questions.length} questions across ${state.catalog.sections.length} sections.`;
  renderProfiles();
  renderActiveProfile();
  renderOnboarding();
  renderSectionFilter();
  renderQuestion();
  renderDashboard();
  renderCatalog();
  elements.nextQuestion.disabled = !activeProfile;
  elements.nextQuestionInline.disabled = !activeProfile;
  elements.resetProfile.disabled = !activeProfile;
  elements.feedbackSubmit.disabled = false;
}

async function loadNextQuestion() {
  if (!getActiveProfile()) {
    return;
  }

  setView("study");
  state.activeQuestion = pickNextQuestion({
    catalog: state.catalog,
    attempts: state.attempts,
    sectionFilter: state.sectionFilter,
    queueMode: state.queueMode,
    currentQuestionId: state.activeQuestion?.id ?? null,
  });

  renderQuestion();
}

async function handleAttemptSubmission(event) {
  event.preventDefault();
  const submitter = event.submitter;

  if (!submitter || !state.activeQuestion || !getActiveProfile()) {
    return;
  }

  const outcome = submitter.dataset.outcome;
  const attempt = createAttempt({
    questionId: state.activeQuestion.id,
    profileId: state.activeProfileId,
    outcome,
    note: elements.attemptNote.value,
  });

  await saveAttempt(attempt);
  state.attempts = [...state.attempts, attempt];
  await loadNextQuestion();
  renderDashboard();
}

async function handleFeedbackSubmission(event) {
  event.preventDefault();

  const payload = getFeedbackPayload();

  if (!payload.message) {
    setFeedbackStatus("Write a quick note before sending.", "error");
    return;
  }

  elements.feedbackSubmit.disabled = true;
  setFeedbackStatus("Sending...", "pending");

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({ ok: false, error: "Feedback could not be sent." }));

    if (!response.ok || !result.ok) {
      throw new Error(result.error || "Feedback could not be sent.");
    }

    elements.feedbackMessage.value = "";
    setFeedbackStatus("Sent to Erik. Thank you.", "success");
  } catch (error) {
    setFeedbackStatus(error instanceof Error ? error.message : "Feedback could not be sent.", "error");
  } finally {
    elements.feedbackSubmit.disabled = false;
  }
}

async function bootstrap() {
  state.catalog = await loadCatalog();
  state.profiles = await getProfiles();

  if (!getActiveProfile() && state.profiles.length > 0) {
    state.activeProfileId = state.profiles[0].id;
    setActiveProfileId(state.activeProfileId);
  }

  if (state.activeProfileId) {
    state.attempts = await getAttemptsForProfile(state.activeProfileId);
  }

  render();
}

elements.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("profileName") ?? "").trim();

  if (!name) {
    return;
  }

  await createAndActivateProfile(name);
  elements.profileName.value = "";
  render();
});

elements.onboardingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get("profileName") ?? "").trim();

  if (!name) {
    return;
  }

  await createAndActivateProfile(name);
  openFirstQuestion();
  elements.onboardingName.value = "";
  render();
});

elements.sectionFilter.addEventListener("change", (event) => {
  state.sectionFilter = event.target.value;
  state.activeQuestion = null;
  render();
});

elements.queueMode.addEventListener("change", (event) => {
  state.queueMode = event.target.value;
  setQueueMode(state.queueMode);
  renderSectionFilter();
});

elements.nextQuestion.addEventListener("click", loadNextQuestion);
elements.nextQuestionInline.addEventListener("click", loadNextQuestion);

elements.toggleSolution.addEventListener("click", () => {
  const hidden = elements.solutionPanel.classList.toggle("hidden");
  elements.toggleSolution.textContent = hidden ? "Reveal solution" : "Hide solution";
});

elements.attemptForm.addEventListener("submit", handleAttemptSubmission);
elements.feedbackForm.addEventListener("submit", handleFeedbackSubmission);

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

elements.exportData.addEventListener("click", async () => {
  const payload = await exportState();
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `studyprep-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

elements.importData.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  const payload = JSON.parse(await file.text());
  await importState(payload);
  state.profiles = await getProfiles();
  state.activeProfileId = getActiveProfileId();
  state.attempts = state.activeProfileId ? await getAttemptsForProfile(state.activeProfileId) : [];
  render();
  event.target.value = "";
});

elements.resetProfile.addEventListener("click", async () => {
  const profile = getActiveProfile();

  if (!profile) {
    return;
  }

  const shouldReset = window.confirm(`Reset all saved progress for ${profile.name}?`);

  if (!shouldReset) {
    return;
  }

  await deleteAttemptsForProfile(profile.id);
  state.attempts = [];
  state.activeQuestion = null;
  render();
});

window.addEventListener("scroll", () => {
  if (activeTooltipAnchor) {
    positionMatrixTooltip(activeTooltipAnchor.getBoundingClientRect());
  }
}, { passive: true });
window.addEventListener("resize", () => {
  if (activeTooltipAnchor) {
    positionMatrixTooltip(activeTooltipAnchor.getBoundingClientRect());
  }
});

bootstrap().catch((error) => {
  elements.catalogSummary.textContent = error.message;
  console.error(error);
});
