const DB_NAME = "studyprep-dashboard";
const DB_VERSION = 1;
const PROFILE_STORE = "profiles";
const ATTEMPT_STORE = "attempts";
const ACTIVE_PROFILE_KEY = "studyprep-active-profile";

function withRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(PROFILE_STORE)) {
        database.createObjectStore(PROFILE_STORE, { keyPath: "id" });
      }

      if (!database.objectStoreNames.contains(ATTEMPT_STORE)) {
        const attempts = database.createObjectStore(ATTEMPT_STORE, { keyPath: "id" });
        attempts.createIndex("by_profile", "profileId", { unique: false });
        attempts.createIndex("by_profile_question", ["profileId", "questionId"], { unique: false });
        attempts.createIndex("by_created_at", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getProfiles() {
  const db = await openDatabase();
  const tx = db.transaction(PROFILE_STORE, "readonly");
  return withRequest(tx.objectStore(PROFILE_STORE).getAll());
}

export async function saveProfile(profile) {
  const db = await openDatabase();
  const tx = db.transaction(PROFILE_STORE, "readwrite");
  await withRequest(tx.objectStore(PROFILE_STORE).put(profile));
}

export async function getAttemptsForProfile(profileId) {
  const db = await openDatabase();
  const tx = db.transaction(ATTEMPT_STORE, "readonly");
  const index = tx.objectStore(ATTEMPT_STORE).index("by_profile");
  return withRequest(index.getAll(profileId));
}

export async function saveAttempt(attempt) {
  const db = await openDatabase();
  const tx = db.transaction(ATTEMPT_STORE, "readwrite");
  await withRequest(tx.objectStore(ATTEMPT_STORE).put(attempt));
}

export async function deleteAttemptsForProfile(profileId) {
  const attempts = await getAttemptsForProfile(profileId);
  const db = await openDatabase();
  const tx = db.transaction(ATTEMPT_STORE, "readwrite");
  const store = tx.objectStore(ATTEMPT_STORE);
  await Promise.all(attempts.map((attempt) => withRequest(store.delete(attempt.id))));
}

export async function exportState() {
  const [profiles, db] = await Promise.all([getProfiles(), openDatabase()]);
  const tx = db.transaction(ATTEMPT_STORE, "readonly");
  const attempts = await withRequest(tx.objectStore(ATTEMPT_STORE).getAll());

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    activeProfileId: getActiveProfileId(),
    profiles,
    attempts,
  };
}

export async function importState(payload) {
  if (!payload || !Array.isArray(payload.profiles) || !Array.isArray(payload.attempts)) {
    throw new Error("Invalid import payload.");
  }

  const db = await openDatabase();
  const tx = db.transaction([PROFILE_STORE, ATTEMPT_STORE], "readwrite");
  const profileStore = tx.objectStore(PROFILE_STORE);
  const attemptStore = tx.objectStore(ATTEMPT_STORE);

  await Promise.all(payload.profiles.map((profile) => withRequest(profileStore.put(profile))));
  await Promise.all(payload.attempts.map((attempt) => withRequest(attemptStore.put(attempt))));

  if (payload.activeProfileId) {
    setActiveProfileId(payload.activeProfileId);
  }
}

export function setActiveProfileId(profileId) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
}

export function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}
