import { getDb } from "./firebase-admin";

function userDoc(userId: string) {
  return getDb().collection("userdata").doc(userId);
}

export async function loadUserData(userId: string): Promise<Record<string, unknown>> {
  try {
    const snap = await userDoc(userId).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function setUserKey(userId: string, key: string, value: unknown): Promise<void> {
  try {
    await userDoc(userId).set({ [key]: value }, { merge: true });
  } catch (e) {
    console.error("Firestore setUserKey error", e);
  }
}

export async function clearUserData(userId: string): Promise<void> {
  try {
    await userDoc(userId).delete();
  } catch (e) {
    console.error("Firestore clearUserData error", e);
  }
}
