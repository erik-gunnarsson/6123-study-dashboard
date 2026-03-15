function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const OUTCOME_FILL = {
  unseen: "#d1d5db",
  correct: "#16a34a",
  failed: "#dc2626",
  repeat: "#f59e0b",
};

const SECTION_MARKER = {
  "part-1": "#0ea5e9",
  "part-2": "#8b5cf6",
  "part-3": "#14b8a6",
  "part-4": "#f97316",
  "part-5": "#eab308",
  "part-6": "#ec4899",
  "part-7": "#6366f1",
};

function faceMarkup(outcome, x, y, size) {
  if (outcome === "unseen") {
    return "";
  }

  const eyeOffsetX = size * 0.22;
  const eyeY = y + size * 0.34;
  const leftEye = `<circle cx="${x + size / 2 - eyeOffsetX}" cy="${eyeY}" r="${size * 0.06}" fill="#ffffff" />`;
  const rightEye = `<circle cx="${x + size / 2 + eyeOffsetX}" cy="${eyeY}" r="${size * 0.06}" fill="#ffffff" />`;

  if (outcome === "repeat") {
    return `${leftEye}${rightEye}<line x1="${x + size * 0.28}" y1="${y + size * 0.66}" x2="${x + size * 0.72}" y2="${y + size * 0.66}" stroke="#ffffff" stroke-width="${size * 0.08}" stroke-linecap="round" />`;
  }

  const mouthPath = outcome === "correct"
    ? `M ${x + size * 0.28} ${y + size * 0.60} Q ${x + size * 0.5} ${y + size * 0.80} ${x + size * 0.72} ${y + size * 0.60}`
    : `M ${x + size * 0.28} ${y + size * 0.76} Q ${x + size * 0.5} ${y + size * 0.54} ${x + size * 0.72} ${y + size * 0.76}`;

  return `${leftEye}${rightEye}<path d="${mouthPath}" fill="none" stroke="#ffffff" stroke-width="${size * 0.08}" stroke-linecap="round" />`;
}

function matrixMarkup(questionStatuses) {
  const columns = 10;
  const size = 28;
  const gap = 8;

  return questionStatuses.map((question, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * (size + gap);
    const y = row * (size + gap);
    const marker = SECTION_MARKER[question.section] ?? "#9ca3af";
    const fill = OUTCOME_FILL[question.outcome] ?? OUTCOME_FILL.unseen;

    return `
      <g>
        <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="7" fill="${fill}" stroke="rgba(17,24,39,0.06)" />
        <path d="M ${x + size - 8} ${y + size} L ${x + size} ${y + size} L ${x + size} ${y + size - 8} Z" fill="${marker}" />
        ${faceMarkup(question.outcome, x, y, size)}
      </g>
    `;
  }).join("");
}

export function buildShareCardModel({ profileName, progression, questionStatuses }) {
  return {
    profileName: profileName || "Anonymous learner",
    currentEmoji: progression.currentEmoji,
    currentLabel: progression.currentLabel,
    xp: progression.xp,
    questionStatuses,
  };
}

export function renderShareCardSvg(model) {
  const columns = 10;
  const size = 28;
  const gap = 8;
  const rows = Math.ceil(model.questionStatuses.length / columns);
  const matrixWidth = columns * size + (columns - 1) * gap;
  const matrixHeight = rows * size + Math.max(0, rows - 1) * gap;
  const width = 760;
  const height = 270 + matrixHeight;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" rx="28" fill="#f5f7fa" />
      <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="24" fill="#ffffff" />
      <text x="54" y="76" font-family="Manrope, system-ui, sans-serif" font-size="24" font-weight="700" fill="#111827">${escapeXml(model.profileName)}</text>
      <text x="54" y="132" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" font-size="54">${escapeXml(model.currentEmoji)}</text>
      <text x="122" y="118" font-family="Space Grotesk, Manrope, sans-serif" font-size="28" font-weight="700" fill="#111827">${escapeXml(model.currentLabel)}</text>
      <text x="122" y="152" font-family="Manrope, system-ui, sans-serif" font-size="20" fill="#667085">${escapeXml(`${model.xp} XP earned`)}</text>
      <text x="54" y="205" font-family="Space Grotesk, Manrope, sans-serif" font-size="18" font-weight="700" letter-spacing="0.08em" fill="#667085">PROGRESS MAP</text>
      <g transform="translate(54 224)">
        ${matrixMarkup(model.questionStatuses)}
      </g>
      <rect x="36" y="${height - 68}" width="${width - 72}" height="34" rx="17" fill="#eff6ff" />
      <text x="${width / 2}" y="${height - 45}" text-anchor="middle" font-family="Space Grotesk, Manrope, sans-serif" font-size="16" font-weight="700" fill="#1d4ed8">6123 Study Dashboard</text>
    </svg>
  `.trim();
}

export async function svgToPngBlob(svgMarkup) {
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas export is not available.");
    }

    context.drawImage(image, 0, 0);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Snapshot export failed."));
        }
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
