const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ANALYTICS_ENDPOINT = "/api/analytics";
const SESSION_KEY_PREFIX = "studyprep-analytics-session";
const ALLOWED_EVENT_TYPES = new Set([
  "profile_selected",
  "session_start",
  "question_answered",
  "feedback_sent",
]);

function createId() {
  const browserCrypto = globalThis.crypto;

  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID();
  }

  if (browserCrypto?.getRandomValues) {
    const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  return `analytics-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getSessionKey(userId) {
  return `${SESSION_KEY_PREFIX}:${userId}`;
}

export function loadAnalyticsSession(storage, userId) {
  if (!storage || !userId) {
    return null;
  }

  try {
    const raw = storage.getItem(getSessionKey(userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.sessionId === "string" &&
      parsed.sessionId &&
      typeof parsed?.lastActivityAt === "number"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function touchAnalyticsSession({
  storage = globalThis.localStorage,
  userId,
  now = Date.now(),
} = {}) {
  if (!storage || !userId) {
    return { sessionId: "", startedNewSession: false, lastActivityAt: now };
  }

  const existing = loadAnalyticsSession(storage, userId);
  const expired = !existing || now - existing.lastActivityAt > SESSION_TIMEOUT_MS;
  const session = {
    sessionId: expired ? createId() : existing.sessionId,
    lastActivityAt: now,
  };

  storage.setItem(getSessionKey(userId), JSON.stringify(session));

  return {
    sessionId: session.sessionId,
    lastActivityAt: session.lastActivityAt,
    startedNewSession: expired,
  };
}

export function buildAnalyticsPayload({
  userId,
  sessionId,
  eventType,
  metadata = {},
}) {
  return {
    userId,
    sessionId,
    eventType,
    metadata,
  };
}

async function postAnalyticsEvent(payload, fetchImpl) {
  await fetchImpl(ANALYTICS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

export async function sendAnalyticsEvent({
  userId,
  eventType,
  metadata = {},
  storage = globalThis.localStorage,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  if (!userId || !fetchImpl || !ALLOWED_EVENT_TYPES.has(eventType)) {
    return { ok: false, skipped: true };
  }

  const session = touchAnalyticsSession({ storage, userId, now });
  const payloads = [];

  if (session.startedNewSession && eventType !== "session_start") {
    payloads.push(buildAnalyticsPayload({
      userId,
      sessionId: session.sessionId,
      eventType: "session_start",
      metadata: {
        triggeredBy: eventType,
      },
    }));
  }

  payloads.push(buildAnalyticsPayload({
    userId,
    sessionId: session.sessionId,
    eventType,
    metadata,
  }));

  await Promise.all(payloads.map((payload) => postAnalyticsEvent(payload, fetchImpl)));

  return {
    ok: true,
    sessionId: session.sessionId,
    startedNewSession: session.startedNewSession,
  };
}

export function trackAnalyticsEvent(options) {
  return sendAnalyticsEvent(options).catch((error) => {
    console.debug("Analytics event skipped.", error);
    return { ok: false, skipped: true };
  });
}

export { ALLOWED_EVENT_TYPES, SESSION_TIMEOUT_MS };
