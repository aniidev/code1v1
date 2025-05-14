import { initializeApp } from "https://esm.sh/firebase/app";
import { getAuth } from "https://esm.sh/firebase/auth";
import { getFirestore } from "https://esm.sh/firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCkTICNK-vuUyFibbVmngQPXvpDORXHpcM",
  authDomain: "code1v1.firebaseapp.com",
  projectId: "code1v1",
  storageBucket: "code1v1.firebasestorage.app",
  messagingSenderId: "791404206432",
  appId: "1:791404206432:web:d172fa535552addcd6e605"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
