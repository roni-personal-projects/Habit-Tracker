import { signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";
import { doc, setDoc, getDoc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { auth, db } from "../firebase";

// ── Types (mirrored from App.tsx) ────────────────────────────

export type Habit = {
    id: string;
    name: string;
    color: string;
    createdAt: string;
};

export type HabitLogs = Record<string, string[]>;

export type StoredHabitState = {
    habits: Habit[];
    logs: HabitLogs;
};

// ── Auth ─────────────────────────────────────────────────────

/**
 * Sign in anonymously and return the user UID.
 * If the user is already signed in the existing UID is returned.
 */
export async function signInAnon(): Promise<string> {
    const credential = await signInAnonymously(auth);
    return credential.user.uid;
}

/**
 * Listen for auth state changes. Returns an unsubscribe function.
 */
export function onAuthChange(callback: (user: User | null) => void): Unsubscribe {
    return onAuthStateChanged(auth, callback);
}

// ── Firestore helpers ────────────────────────────────────────

const COLLECTION = "users";

function userDocRef(uid: string) {
    return doc(db, COLLECTION, uid);
}

/**
 * Save the full habit state to Firestore.
 */
export async function saveHabitState(uid: string, state: StoredHabitState): Promise<void> {
    await setDoc(userDocRef(uid), {
        habits: state.habits,
        logs: state.logs,
        updatedAt: new Date().toISOString(),
    });
}

/**
 * Load the habit state from Firestore. Returns null when nothing exists yet.
 */
export async function loadHabitState(uid: string): Promise<StoredHabitState | null> {
    const snapshot = await getDoc(userDocRef(uid));

    if (!snapshot.exists()) {
        return null;
    }

    const data = snapshot.data();

    if (!Array.isArray(data.habits) || typeof data.logs !== "object" || data.logs === null) {
        return null;
    }

    return { habits: data.habits as Habit[], logs: data.logs as HabitLogs };
}

/**
 * Subscribe to real-time updates on the user's habit state.
 * The callback fires immediately with the current data and on every change.
 * Returns an unsubscribe function.
 */
export function subscribeToHabitState(
    uid: string,
    callback: (state: StoredHabitState | null) => void,
): Unsubscribe {
    return onSnapshot(userDocRef(uid), (snapshot) => {
        if (!snapshot.exists()) {
            callback(null);
            return;
        }

        const data = snapshot.data();

        if (!Array.isArray(data.habits) || typeof data.logs !== "object" || data.logs === null) {
            callback(null);
            return;
        }

        callback({ habits: data.habits as Habit[], logs: data.logs as HabitLogs });
    });
}
