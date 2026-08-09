import { createClient, type BlinkUser } from '@blinkdotnew/sdk';

// 'headless' mode lets us build our own simple sign-in/sign-up form (see
// AuthPanel.tsx) instead of redirecting to Blink's hosted auth page - the
// site works fully without ever signing in either way (see getEffectiveUserId
// below), this is purely an optional extra for anyone who wants their
// history to follow them across devices/sessions instead of staying tied to
// this one browser.
export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'movies-tv-recaps-maker-hub-hr704mxx',
  auth: {
    mode: 'headless'
  }
});

export type { BlinkUser };

/**
 * blink.auth.me() throws instead of resolving to null when nobody is signed
 * in - which is the normal, expected state here since signing in is
 * optional. This wraps it so "not signed in" is just a null, not a thrown
 * error every caller needs to remember to catch.
 */
export async function getCurrentUser(): Promise<BlinkUser | null> {
  try {
    return await blink.auth.me();
  } catch {
    return null;
  }
}

const ANONYMOUS_ID_KEY = 'anonymousUserId';

/**
 * A stable, private-to-this-browser ID for anyone who never signs in, so
 * "not signed in" still gets a consistent (if not cross-device) history
 * instead of either failing outright or dumping everyone into one shared
 * "anonymous" bucket.
 */
function getAnonymousId(): string {
  let id = localStorage.getItem(ANONYMOUS_ID_KEY);
  if (!id) {
    id = `anon-${crypto.randomUUID()}`;
    localStorage.setItem(ANONYMOUS_ID_KEY, id);
  }
  return id;
}

/** The ID to store data under: the signed-in user's real ID if there is one, otherwise this browser's anonymous ID. */
export async function getEffectiveUserId(): Promise<string> {
  const user = await getCurrentUser();
  return user?.id || getAnonymousId();
}

export interface RecapRecord {
  id: string;
  userId: string;
  title: string;
  genre?: string;
  description?: string;
  scriptText: string;
  videoUrl?: string;
  audioUrl?: string;
  duration: number;
  cutInterval: number;
  createdAt: string;
  // Optional feedback set from History - "up"-rated recaps are fed back into
  // future script-generation prompts as few-shot examples (see
  // recapStorageService.getGoodExamples), so the app improves from actual
  // usage over time without needing to retrain the underlying model.
  rating?: 'up' | 'down';
}

// Tracks a Gemini fine-tuning job for a given user/API key, so the app can
// check back on long-running training across sessions instead of blocking
// on it. See src/lib/geminiTuning.ts.
export interface TuningJobRecord {
  id: string;
  userId: string;
  operationName: string; // e.g. "tunedModels/xxx/operations/yyy", used to poll status
  baseModel: string;
  exampleCount: number;
  status: 'training' | 'ready' | 'failed';
  tunedModelName?: string; // e.g. "tunedModels/xxx", set once status is "ready"
  errorMessage?: string;
  createdAt: string;
}
