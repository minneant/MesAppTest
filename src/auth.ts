import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  User,
} from "firebase/auth";

function toEmail(idOrEmail: string) {
  const s = idOrEmail.trim();
  return s.includes("@") ? s : `${s}@daewon.local`;
}

export async function signInWithIdPw(id: string, pw: string) {
  return await signInWithEmailAndPassword(getAuth(), toEmail(id), pw);
}

export async function logout() {
  await signOut(getAuth());
}

export function waitForAuth(): Promise<User | null> {
  const auth = getAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
}
