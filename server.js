import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const port = Number(process.env.PORT || 4173);
const feedbackWebhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL || "";
const maxFeedbackLength = 1200;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);

function resolvePath(urlPath) {
  const cleanPath = decodeURIComponent((urlPath || "/").split("?")[0]);
  const normalized = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const relativePath = normalized === path.sep ? "index.html" : normalized.replace(/^[/\\]+/, "");
  return path.join(rootDir, relativePath);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sendError(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function formatFeedbackMessage(payload) {
  const lines = [
    "**New Study Dashboard Feedback**",
    `**Profile:** ${payload.profileName || "Anonymous"}`,
    `**View:** ${payload.view || "unknown"}`,
  ];

  if (payload.questionId || payload.questionTitle) {
    lines.push(`**Question:** ${payload.questionTitle || "Untitled"} (${payload.questionId || "no-id"})`);
  }

  lines.push(`**Sent:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push(payload.message);

  return lines.join("\n");
}

export async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function validateFeedbackPayload(payload) {
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!message) {
    return { ok: false, statusCode: 400, error: "Feedback message is required." };
  }

  if (message.length > maxFeedbackLength) {
    return { ok: false, statusCode: 400, error: `Feedback must be ${maxFeedbackLength} characters or fewer.` };
  }

  return {
    ok: true,
    value: {
      message,
      profileName: typeof payload?.profileName === "string" ? payload.profileName.trim().slice(0, 80) : "",
      view: typeof payload?.view === "string" ? payload.view.trim().slice(0, 30) : "",
      questionId: typeof payload?.questionId === "string" ? payload.questionId.trim().slice(0, 80) : "",
      questionTitle: typeof payload?.questionTitle === "string" ? payload.questionTitle.trim().slice(0, 140) : "",
    },
  };
}

export async function forwardFeedbackToDiscord(payload, webhookUrl = feedbackWebhookUrl, fetchImpl = fetch) {
  if (!webhookUrl) {
    return { ok: false, statusCode: 503, error: "Feedback is not configured yet." };
  }

  const discordResponse = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: formatFeedbackMessage(payload),
    }),
  });

  if (!discordResponse.ok) {
    return { ok: false, statusCode: 502, error: "Discord webhook request failed." };
  }

  return { ok: true };
}

export async function handleFeedbackRequest(request, response, options = {}) {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "Method not allowed." });
    return;
  }

  const contentType = request.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    sendJson(response, 415, { ok: false, error: "Use application/json." });
    return;
  }

  try {
    const rawPayload = await readJsonBody(request);
    const validation = validateFeedbackPayload(rawPayload);

    if (!validation.ok) {
      sendJson(response, validation.statusCode, { ok: false, error: validation.error });
      return;
    }

    const result = await forwardFeedbackToDiscord(
      validation.value,
      options.webhookUrl,
      options.fetchImpl,
    );

    if (!result.ok) {
      sendJson(response, result.statusCode, { ok: false, error: result.error });
      return;
    }

    sendJson(response, 200, { ok: true });
  } catch {
    sendJson(response, 400, { ok: false, error: "Invalid JSON payload." });
  }
}

export const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendError(response, 400, "Bad request");
    return;
  }

  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  if (request.url === "/api/feedback") {
    await handleFeedbackRequest(request, response);
    return;
  }

  let filePath = resolvePath(request.url);

  try {
    const fileStats = await stat(filePath).catch(() => null);
    if (fileStats?.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (!(await fileExists(filePath))) {
      filePath = path.join(rootDir, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes.get(ext) || "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });

    createReadStream(filePath).pipe(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(response, 500, `Server error: ${message}`);
  }
});

export async function logStartupMessage() {
  const catalogPath = path.join(rootDir, "data", "question-catalog.json");
  const catalogStatus = (await readFile(catalogPath, "utf8").then(() => "loaded").catch(() => "missing"));
  console.log(`StudyPrep dashboard listening on http://0.0.0.0:${port} (${catalogStatus} catalog)`);
}

if (process.argv[1] === __filename) {
  server.listen(port, "0.0.0.0", () => {
    logStartupMessage().catch((error) => {
      console.error(error);
    });
  });
}
