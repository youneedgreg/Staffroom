/**
 * Firebase start-up: App Check, AI Logic, Remote Config, anonymous sign-in and the plan library.
 *
 * Type-checked against firebase 13.3.0. NOT run in this starter (it needs your project).
 * What goes to Firebase from this file:
 *   - App Check tokens and an anonymous sign-in. No learner data.
 *   - Remote Config reads. No learner data.
 *   - Shared plans: the curriculum question and the cloud's answer, only for plans asked
 *     without web sources. No learner data. See `src/core/library.ts`.
 * Learner data is only ever read by `src/store/store.ts`, which has no network code.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  getDocs,
  initializeFirestore,
  limit,
  orderBy,
  persistentLocalCache,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { fetchAndActivate, getRemoteConfig, getValue, onConfigUpdate, activate, type RemoteConfig } from 'firebase/remote-config';
import { DEFAULT_SETTINGS, parseSettings, RC_KEYS, type Settings } from '../core/policy';
import type { PlanLibrary, SharedPlan } from '../core/library';
import type { Engine } from '../engine/engine';
import { FirebaseEngine } from '../engine/firebase';

const env = import.meta.env;

export function hasFirebaseConfig(): boolean {
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
}

export interface Services {
  engine: Engine;
  settings: Settings;
  /** Calls back whenever a new Remote Config template is published. Returns a stop function. */
  watchSettings(onChange: (settings: Settings) => void): () => void;
  plans: PlanLibrary;
}

function readSettings(rc: RemoteConfig): Settings {
  return parseSettings({
    [RC_KEYS.policy]: getValue(rc, RC_KEYS.policy).asString(),
    [RC_KEYS.cloudModel]: getValue(rc, RC_KEYS.cloudModel).asString(),
    [RC_KEYS.modes]: getValue(rc, RC_KEYS.modes).asString(),
  });
}

function planLibrary(db: Firestore, uid: () => string | undefined): PlanLibrary {
  const plans = collection(db, 'plans');
  return {
    async share(plan) {
      const me = uid();
      if (!me) throw new Error('not signed in');
      // Exactly the fields the Firestore rules allow. No sources: grounded plans are never shared.
      await addDoc(plans, {
        packId: plan.packId,
        subStrandId: plan.subStrandId,
        question: plan.question,
        answer: plan.answer,
        at: plan.at,
        uid: me,
      });
    },
    async list(packId, subStrandId) {
      const q = query(
        plans,
        where('packId', '==', packId),
        where('subStrandId', '==', subStrandId),
        orderBy('at', 'desc'),
        limit(10),
      );
      const snapshot = await getDocs(q);
      const me = uid();
      return snapshot.docs.map((d): SharedPlan => {
        const data = d.data();
        return {
          id: d.id,
          packId: String(data.packId),
          subStrandId: String(data.subStrandId),
          question: String(data.question),
          answer: String(data.answer),
          at: Number(data.at),
          mine: Boolean(me) && data.uid === me,
        };
      });
    },
  };
}

export async function startFirebase(): Promise<Services> {
  const app: FirebaseApp = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });

  // App Check must start before any other Firebase service is used.
  // In `npm run dev` the debug provider is used: the token is printed in the browser console
  // the first time, and you register it in the Firebase console (App Check, Apps, Manage debug tokens).
  if (env.DEV) {
    (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? ''),
    isTokenAutoRefreshEnabled: true,
  });

  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const engine = new FirebaseEngine(ai);

  const rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = env.DEV ? 0 : 3_600_000;
  rc.defaultConfig = {
    [RC_KEYS.policy]: DEFAULT_SETTINGS.policy,
    [RC_KEYS.cloudModel]: DEFAULT_SETTINGS.cloudModel,
    [RC_KEYS.modes]: '{}',
  };
  try {
    await fetchAndActivate(rc);
  } catch {
    // Offline: the last activated values, or the defaults, are used.
  }

  const auth = getAuth(app);
  // Offline on first run: sign-in fails and the plan library simply stays empty.
  signInAnonymously(auth).catch(() => undefined);

  const db = initializeFirestore(app, { localCache: persistentLocalCache() });

  return {
    engine,
    settings: readSettings(rc),
    watchSettings(onChange) {
      return onConfigUpdate(rc, {
        next: () => {
          void activate(rc).then(() => onChange(readSettings(rc)));
        },
        error: () => undefined,
        complete: () => undefined,
      });
    },
    plans: planLibrary(db, () => auth.currentUser?.uid),
  };
}
