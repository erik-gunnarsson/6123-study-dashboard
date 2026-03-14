import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const port = Number(process.env.PORT || 4173);

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

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendError(response, 400, "Bad request");
    return;
  }

  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok");
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

server.listen(port, "0.0.0.0", async () => {
  const catalogPath = path.join(rootDir, "data", "question-catalog.json");
  const catalogStatus = (await readFile(catalogPath, "utf8").then(() => "loaded").catch(() => "missing"));
  console.log(`StudyPrep dashboard listening on http://0.0.0.0:${port} (${catalogStatus} catalog)`);
});
