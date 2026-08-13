/** Local project persistence so a refresh (or an accidental tab close) never
 * loses work. Everything stays on the device — media blobs and a small metadata
 * snapshot live in IndexedDB — which keeps StoryMaker's "nothing is uploaded
 * anywhere" promise. Nothing here ever talks to a server.
 *
 * Layout: two object stores in one database.
 *   - `media`    : id → Blob (the raw file bytes; written once per item)
 *   - `snapshot` : "current" → {@link PersistedProject} (tiny, rewritten on edit)
 *
 * The blobs are stored separately from the snapshot so reordering, effect, or
 * format changes only rewrite the few-KB snapshot, never the hundreds of MB of
 * media.
 */
import type {
  AudioCrossfadeSettings,
  AudioFadeSettings,
  AudioTrack,
  CardSettings,
  ImageMediaItem,
  OrderingMode,
  RenderSettings,
  TransitionSettings,
  VideoMediaItem,
  VisualEffectOverrides,
  VisualMediaItem,
  ZoomEffectSettings,
} from "../types";
import {
  DEFAULT_AUDIO_CROSSFADE,
  DEFAULT_AUDIO_FADE,
  DEFAULT_END_CARD,
  DEFAULT_TITLE_CARD,
} from "../types";
import type { StageId } from "../state/projectReducer";

const DB_NAME = "storymaker";
const DB_VERSION = 1;
const MEDIA_STORE = "media";
const SNAPSHOT_STORE = "snapshot";
const SNAPSHOT_KEY = "current";
const SCHEMA_VERSION = 1;

/** The authoring slice of project state we persist and restore. Transient
 * runtime fields (render status/progress/result/error/notices) are never saved. */
export interface RestoredProject {
  stage: StageId;
  audioTracks: AudioTrack[];
  visualItems: VisualMediaItem[];
  orderingMode: OrderingMode;
  settings: RenderSettings;
  titleCard: CardSettings;
  endCard: CardSettings;
  audioCrossfade: AudioCrossfadeSettings;
  audioFade: AudioFadeSettings;
  projectTransition: TransitionSettings;
  projectZoom: ZoomEffectSettings;
  effectOverrides: Record<string, VisualEffectOverrides | undefined>;
}

/** Per-media metadata in the snapshot; the bytes live in the `media` store by id. */
interface AudioRef {
  id: string;
  name: string;
  duration: number;
  size: number;
  fileType: string;
}
type VisualRef = {
  id: string;
  name: string;
  size: number;
  fileType: string;
  createdAt: number;
  dateSource: VisualMediaItem["dateSource"];
  width: number;
  height: number;
} & ({ kind: "image" } | { kind: "video"; duration: number });

interface PersistedProject {
  version: number;
  stage: StageId;
  orderingMode: OrderingMode;
  settings: RenderSettings;
  titleCard: CardSettings;
  endCard: CardSettings;
  audioCrossfade: AudioCrossfadeSettings;
  audioFade: AudioFadeSettings;
  projectTransition: TransitionSettings;
  projectZoom: ZoomEffectSettings;
  effectOverrides: Record<string, VisualEffectOverrides | undefined>;
  audio: AudioRef[];
  visuals: VisualRef[];
}

const hasIDB = (): boolean =>
  typeof indexedDB !== "undefined" && indexedDB !== null;

/** Media ids known to be in the `media` store already, so autosave only writes
 * the bytes of genuinely new items (not the whole library on every edit). */
const persistedMediaIds = new Set<string>();

// ---- pure mapping (unit-testable without IndexedDB) -------------------------

/** Split project state into a tiny snapshot + the list of media blobs to store. */
export function toPersisted(state: RestoredProject): {
  snapshot: PersistedProject;
  media: { id: string; blob: Blob }[];
} {
  const audio: AudioRef[] = state.audioTracks.map((t) => ({
    id: t.id,
    name: t.name,
    duration: t.duration,
    size: t.size,
    fileType: t.file.type,
  }));
  const visuals: VisualRef[] = state.visualItems.map((v) =>
    v.kind === "video"
      ? {
          id: v.id, name: v.name, size: v.size, fileType: v.file.type,
          createdAt: v.createdAt, dateSource: v.dateSource,
          width: v.width, height: v.height, kind: "video", duration: v.duration,
        }
      : {
          id: v.id, name: v.name, size: v.size, fileType: v.file.type,
          createdAt: v.createdAt, dateSource: v.dateSource,
          width: v.width, height: v.height, kind: "image",
        },
  );
  const media = [
    ...state.audioTracks.map((t) => ({ id: t.id, blob: t.file })),
    ...state.visualItems.map((v) => ({ id: v.id, blob: v.file })),
  ];
  return {
    snapshot: {
      version: SCHEMA_VERSION,
      stage: state.stage,
      orderingMode: state.orderingMode,
      settings: state.settings,
      titleCard: state.titleCard,
      endCard: state.endCard,
      audioCrossfade: state.audioCrossfade,
      audioFade: state.audioFade,
      projectTransition: state.projectTransition,
      projectZoom: state.projectZoom,
      effectOverrides: state.effectOverrides,
      audio,
      visuals,
    },
    media,
  };
}

/** Rebuild project state from a snapshot + the media blobs keyed by id. Missing
 * blobs drop that item rather than crashing. Recreates fresh object URLs. */
export function fromPersisted(
  snapshot: PersistedProject,
  blobs: Map<string, Blob>,
): RestoredProject {
  const audioTracks: AudioTrack[] = [];
  for (const a of snapshot.audio) {
    const blob = blobs.get(a.id);
    if (!blob) continue;
    const file = new File([blob], a.name, { type: a.fileType });
    audioTracks.push({
      id: a.id, file, name: a.name, duration: a.duration, size: a.size,
      previewUrl: URL.createObjectURL(file),
    });
  }
  const visualItems: VisualMediaItem[] = [];
  for (const v of snapshot.visuals) {
    const blob = blobs.get(v.id);
    if (!blob) continue;
    const file = new File([blob], v.name, { type: v.fileType });
    const base = {
      id: v.id, file, name: v.name, size: v.size,
      previewUrl: URL.createObjectURL(file),
      createdAt: v.createdAt, dateSource: v.dateSource,
      width: v.width, height: v.height,
    };
    visualItems.push(
      v.kind === "video"
        ? ({ ...base, kind: "video", duration: v.duration } as VideoMediaItem)
        : ({ ...base, kind: "image" } as ImageMediaItem),
    );
  }
  return {
    stage: snapshot.stage,
    audioTracks,
    visualItems,
    orderingMode: snapshot.orderingMode,
    settings: snapshot.settings,
    titleCard: snapshot.titleCard ?? DEFAULT_TITLE_CARD,
    endCard: snapshot.endCard ?? DEFAULT_END_CARD,
    audioCrossfade: snapshot.audioCrossfade ?? DEFAULT_AUDIO_CROSSFADE,
    audioFade: snapshot.audioFade ?? DEFAULT_AUDIO_FADE,
    projectTransition: snapshot.projectTransition,
    projectZoom: snapshot.projectZoom,
    effectOverrides: snapshot.effectOverrides,
  };
}

// ---- IndexedDB layer --------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE);
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const tx = (db: IDBDatabase, store: string, mode: IDBTransactionMode) =>
  db.transaction(store, mode).objectStore(store);

const asPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** True when there is a non-empty saved project (any media) on this device. */
export function hasSavedProject(state: RestoredProject): boolean {
  return state.audioTracks.length > 0 || state.visualItems.length > 0;
}

/** Persist the current authoring state. Writes new media bytes once, prunes
 * removed ones, and rewrites the small snapshot. Empty state clears storage.
 * Never throws — persistence is best-effort and must not break the editor. */
export async function saveProject(state: RestoredProject): Promise<void> {
  if (!hasIDB()) return;
  try {
    if (!hasSavedProject(state)) {
      await clearProject();
      return;
    }
    const { snapshot, media } = toPersisted(state);
    const db = await openDB();
    const liveIds = new Set(media.map((m) => m.id));

    // write only media not already persisted
    const toWrite = media.filter((m) => !persistedMediaIds.has(m.id));
    if (toWrite.length) {
      const store = tx(db, MEDIA_STORE, "readwrite");
      await Promise.all(toWrite.map((m) => asPromise(store.put(m.blob, m.id))));
      for (const m of toWrite) persistedMediaIds.add(m.id);
    }
    // prune media for removed items
    const stale = [...persistedMediaIds].filter((id) => !liveIds.has(id));
    if (stale.length) {
      const store = tx(db, MEDIA_STORE, "readwrite");
      await Promise.all(stale.map((id) => asPromise(store.delete(id))));
      for (const id of stale) persistedMediaIds.delete(id);
    }
    await asPromise(tx(db, SNAPSHOT_STORE, "readwrite").put(snapshot, SNAPSHOT_KEY));
    db.close();
  } catch {
    /* best-effort: ignore quota / private-mode / transaction errors */
  }
}

/** Load and rebuild the saved project, or null when there is nothing usable. */
export async function loadProject(): Promise<RestoredProject | null> {
  if (!hasIDB()) return null;
  try {
    const db = await openDB();
    const snapshot = await asPromise<PersistedProject | undefined>(
      tx(db, SNAPSHOT_STORE, "readonly").get(SNAPSHOT_KEY),
    );
    if (!snapshot || snapshot.version !== SCHEMA_VERSION) {
      db.close();
      return null;
    }
    const ids = [...snapshot.audio, ...snapshot.visuals].map((m) => m.id);
    const mediaStore = tx(db, MEDIA_STORE, "readonly");
    const blobs = new Map<string, Blob>();
    await Promise.all(
      ids.map(async (id) => {
        const blob = await asPromise<Blob | undefined>(mediaStore.get(id));
        if (blob) blobs.set(id, blob);
      }),
    );
    db.close();
    // seed the persisted-id set so autosave doesn't rewrite these bytes
    persistedMediaIds.clear();
    for (const id of blobs.keys()) persistedMediaIds.add(id);
    const restored = fromPersisted(snapshot, blobs);
    return hasSavedProject(restored) ? restored : null;
  } catch {
    return null;
  }
}

/** Delete the saved project entirely (used on explicit reset). */
export async function clearProject(): Promise<void> {
  persistedMediaIds.clear();
  if (!hasIDB()) return;
  try {
    const db = await openDB();
    await Promise.all([
      asPromise(tx(db, MEDIA_STORE, "readwrite").clear()),
      asPromise(tx(db, SNAPSHOT_STORE, "readwrite").clear()),
    ]);
    db.close();
  } catch {
    /* ignore */
  }
}
