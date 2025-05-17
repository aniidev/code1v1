import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://esm.sh/firebase/auth";
import { doc, setDoc, getDoc, collection, query, orderBy, getDocs } from "https://esm.sh/firebase/firestore";
import { auth, db } from "./firebase.js";
import { signOut } from "https://esm.sh/firebase/auth";

export async function register(email, password, username) {
  try {
    // Create the user account
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    
    // Create user document in Firestore
    await setDoc(doc(db, "users", uid), {
      username,
      email,
      elo: 1000,
      wins: 0
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

export async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    const userDoc = await getDoc(doc(db, "users", uid));
    
    if (userDoc.exists()) {
      const userData = {
        uid,
        ...userDoc.data()
      };
      
      // Save user data to localStorage
      localStorage.setItem("userData", JSON.stringify(userData));
      
      return userData;
    } else {
      throw new Error("User data not found");
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