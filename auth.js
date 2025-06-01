import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://esm.sh/firebase/auth";
import { doc, setDoc, getDoc, collection, query, orderBy, getDocs, where } from "https://esm.sh/firebase/firestore";
import { auth, db } from "./firebase.js";
import { signOut } from "https://esm.sh/firebase/auth";
import { GoogleAuthProvider, signInWithPopup } from "https://esm.sh/firebase/auth";

export async function register(email, password, username) {
  try {
    // Create the user account
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    
    // Check if username is already taken (optional but ideal)
    const usernameRef = doc(db, "usernames", username);
    const usernameSnap = await getDoc(usernameRef);
    if (usernameSnap.exists()) {
      throw new Error("Username already taken");
    }

    // Create user document in Firestore
    await setDoc(doc(db, "users", uid), {
      username,
      email,
      elo: 1000,
      wins: 0
    });

    // Create public username→uid mapping
    await setDoc(doc(db, "usernames", username), {
      uid
    });
    
    // Store user data in localStorage
    const userData = {
      uid,
      username,
      email,
      elo: 1000,
      wins: 0
    };
    localStorage.setItem("userData", JSON.stringify(userData));
    
    // Redirect to homepage
    window.location.href = 'index.html';
    
    return userData;
  } catch (error) {
    console.error("Registration error:", error);
    throw error;
  }
}

export async function login(identifier, password) {
  try {
    let email = identifier;

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);

    if (!isEmail) {
      // Securely fetch UID from usernames mapping
      const usernameDoc = await getDoc(doc(db, "usernames", identifier));
      if (!usernameDoc.exists()) {
        throw new Error("Username not found");
      }

      const { uid } = usernameDoc.data();

      // Get the email from the user document
      const userDoc = await getDoc(doc(db, "users", uid));
      if (!userDoc.exists()) {
        throw new Error("User data not found");
      }

      const userDataFromDoc = userDoc.data();
      email = userDataFromDoc.email;
    }

    // Sign in with the resolved email
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const userData = {
        uid,
        ...userDoc.data()
      };

      localStorage.setItem("userData", JSON.stringify(userData));
      return userData;
    } else {
      throw new Error("User data not found after login");
    }
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

export function logout() {
  try {
    signOut(auth);
    localStorage.removeItem("userData");
    window.location.reload();
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
}

export async function fetchLeaderboard() {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("elo", "desc"));
    const snapshot = await getDocs(q);
    
    const users = [];
    snapshot.forEach(doc => {
      users.push(doc.data());
    });
    return users;
  } catch (error) {
    console.error("Fetch leaderboard error:", error);
    throw error;
  }
}

// Add this helper function to check login status
export function getCurrentUser() {
  const userData = localStorage.getItem("userData");
  return userData ? JSON.parse(userData) : null;
}

// Export the logout function to make it available through import
window.logout = logout;


export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const userDocRef = doc(db, "users", user.uid);
    let userDoc = await getDoc(userDocRef);

    const userData = {
      uid: user.uid,
      ...userDoc.data()
    };

    // Save to localStorage
    localStorage.setItem("userData", JSON.stringify(userData));

    // Redirect to homepage
    window.location.href = "index.html";

    return userData;
  } catch (error) {
    console.error("Google login error:", error);
    throw error;
  }
}

export async function signUpWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // Temporarily store user info and redirect to username page
      sessionStorage.setItem("tempGoogleUser", JSON.stringify({
        uid: user.uid,
        email: user.email
      }));
      window.location.href = "setUsername.html";
    } else {
      // Existing user
      const userData = {
        uid: user.uid,
        ...userDoc.data()
      };
      localStorage.setItem("userData", JSON.stringify(userData));
      window.location.href = "index.html";
      return userData;
    }
  } catch (error) {
    console.error("Google sign-up error:", error);
    throw error;
  }
}