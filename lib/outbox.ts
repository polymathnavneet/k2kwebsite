"use client";

/**
 * The outbox.
 *
 * Everything the walk sends - a GPS fix, a reply, the day's entry, a message
 * from a visitor, a book registration - goes in here first and is sent from
 * here. On a road with no signal that is the difference between "saved" and
 * "gone".
 *
 * IndexedDB rather than localStorage, because localStorage was capped at the
 * last twenty items and silently dropped the rest, has no room for a day of GPS
 * points, and is synchronous on the main thread.
 *
 * Every item carries an id generated when it was written, and that id is sent
 * with the request. A send that times out but actually arrived cannot become a
 * duplicate, because the second attempt carries the same id.
 */

const DB_NAME = "a-long-walk";
const STORE = "outbox";
const VERSION = 1;

export type Outgoing = {
  id: string;
  url: string;
  payload: Record<string, unknown>;
  /** Shown to the person waiting, e.g. "your message to the wall". */
  label: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no IndexedDB"));
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = work(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export async function queue(url: string, payload: Record<string, unknown>, label: string) {
  const item: Outgoing = {
    id: String(payload.clientId ?? newId()),
    url,
    payload: { ...payload, clientId: payload.clientId ?? newId() },
    label,
    createdAt: Date.now(),
    attempts: 0,
  };
  item.payload.clientId = item.id;
  await run("readwrite", store => store.put(item));
  announce();
  return item.id;
}

export async function pending(): Promise<Outgoing[]> {
  try {
    const rows = await run<Outgoing[]>("readonly", store => store.getAll() as IDBRequest<Outgoing[]>);
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

async function drop(id: string) {
  await run("readwrite", store => store.delete(id) as unknown as IDBRequest<undefined>);
}

async function mark(item: Outgoing, error: string) {
  await run("readwrite", store => store.put({ ...item, attempts: item.attempts + 1, lastError: error }));
}

function announce() {
  pending().then(rows => {
    document.dispatchEvent(new CustomEvent("alw:outbox", { detail: { count: rows.length, rows } }));
  });
}

let flushing = false;

/**
 * Send what is waiting, oldest first.
 *
 * A rejection the server will never accept (a 4xx) is dropped rather than
 * retried forever - keeping it would block everything behind it. Anything else
 * stays queued for the next attempt.
 */
export async function flush(headers: Record<string, string> = {}) {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;

  try {
    for (const item of await pending()) {
      try {
        const response = await fetch(item.url, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(item.payload),
        });
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          await drop(item.id);
          sent += 1;
        } else {
          await mark(item, `Server said ${response.status}`);
          break; // the server is unhappy; stop rather than hammer it
        }
      } catch (error) {
        await mark(item, error instanceof Error ? error.message : "No connection");
        break; // still offline
      }
    }
  } finally {
    flushing = false;
    announce();
  }

  return sent;
}

/**
 * Send now, or queue and tell the caller it was queued.
 * Callers show one of two honest messages rather than pretending it went.
 */
export async function send(url: string, payload: Record<string, unknown>, label: string, headers: Record<string, string> = {}) {
  const clientId = String(payload.clientId ?? newId());
  const body = { ...payload, clientId };

  if (navigator.onLine) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) return { sent: true, result };
      // The server understood and refused: queueing would not help.
      if (response.status >= 400 && response.status < 500) {
        throw Object.assign(new Error(result.error || "That was not accepted"), { permanent: true });
      }
    } catch (error) {
      if ((error as { permanent?: boolean })?.permanent) throw error;
    }
  }

  await queue(url, body, label);
  return { sent: false, queued: true, clientId };
}

/** Start watching: flush when the connection returns and on a slow heartbeat. */
export function watchOutbox(headers: () => Record<string, string> = () => ({})) {
  if (typeof window === "undefined") return () => {};
  const go = () => { flush(headers()); };
  addEventListener("online", go);
  const timer = setInterval(go, 60000);
  const first = setTimeout(go, 1500);
  return () => {
    removeEventListener("online", go);
    clearInterval(timer);
    clearTimeout(first);
  };
}
