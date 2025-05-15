import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://esm.sh/firebase/auth";
import { doc, setDoc, getDoc } from "https://esm.sh/firebase/firestore";
import { auth, db } from "./firebase.js";
import { signOut } from "https://esm.sh/firebase/auth";

export async function register(email, password, username) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;

  await setDoc(doc(db, "users", uid), {
    username,
    email,
    elo: 1000
  });
}

export async function login(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const uid = userCredential.user.uid;
  const userDoc = await getDoc(doc(db, "users", uid));
  return {
    uid,               // <-- Add this line
    ...userDoc.data()  // <-- Spread the Firestore data
  };
}
window.logout = async function() {
  await signOut(auth);
  localStorage.removeItem("userData");
  window.location.href = "login.html"; 
};