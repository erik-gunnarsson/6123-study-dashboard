const CHATGPT_BASE_URL = "https://chatgpt.com/";
const MAX_PROMPT_URL_LENGTH = 7000;

function trimBlock(value) {
  return String(value ?? "").trim();
}

export function buildAiExplainPrompt(question, { includeSolution = true } = {}) {
  const sectionLabel = trimBlock(question?.sectionLabel);
  const title = trimBlock(question?.title);
  const prompt = trimBlock(question?.prompt);
  const solution = trimBlock(question?.solutionText);

  const lines = [
    "You are a master's-level finance professor.",
    "Explain the following finance question in a clear, step-by-step, student-friendly way.",
    "Use intuitive reasoning, formulas where relevant, worked calculation steps, and end with a short takeaway.",
    "Do not just restate the answer. Teach the reasoning behind it and call out any important assumptions.",
    "",
    "Question context:",
    `Section: ${sectionLabel || "Unknown section"}`,
    `Title: ${title || "Untitled question"}`,
    "",
    "Question:",
    prompt || "No question prompt provided.",
  ];

  if (includeSolution && solution) {
    lines.push("");
    lines.push("Official solution context:");
    lines.push(solution);
  }

  return lines.join("\n");
}

export function buildChatGptUrl(prompt) {
  return `${CHATGPT_BASE_URL}?prompt=${encodeURIComponent(prompt)}`;
}

export function getAiExplainLaunchStrategy(question) {
  const fullPrompt = buildAiExplainPrompt(question, { includeSolution: true });
  const fullUrl = buildChatGptUrl(fullPrompt);

  if (fullUrl.length <= MAX_PROMPT_URL_LENGTH) {
    return {
      mode: "full",
      url: fullUrl,
      prompt: fullPrompt,
    };
  }

  const shortPrompt = buildAiExplainPrompt(question, { includeSolution: false });
  const shortUrl = buildChatGptUrl(shortPrompt);

  if (shortUrl.length <= MAX_PROMPT_URL_LENGTH) {
    return {
      mode: "short",
      url: shortUrl,
      prompt: shortPrompt,
    };
  }

  return {
    mode: "clipboard",
    url: CHATGPT_BASE_URL,
    prompt: fullPrompt,
  };
}

export async function openAiExplain(question, options = {}) {
  const launchStrategy = getAiExplainLaunchStrategy(question);
  const openWindow = options.openWindow ?? ((url) => window.open(url, "_blank", "noopener,noreferrer"));
  const clipboard = options.clipboard ?? navigator.clipboard;

  if (launchStrategy.mode === "clipboard") {
    if (!clipboard?.writeText) {
      throw new Error("AI explain prompt is too long for a direct link in this browser.");
    }

    await clipboard.writeText(launchStrategy.prompt);
    openWindow(launchStrategy.url);

    return {
      mode: "clipboard",
      message: "Prompt copied. Paste it into ChatGPT.",
    };
  }

  openWindow(launchStrategy.url);

  return {
    mode: launchStrategy.mode,
    message: launchStrategy.mode === "short"
      ? "Opened ChatGPT with a shorter prompt."
      : "Opened ChatGPT with the full prompt.",
  };
}

export { CHATGPT_BASE_URL, MAX_PROMPT_URL_LENGTH };
