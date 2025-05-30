import { login, loginWithGoogle } from "./auth.js";



document.getElementById("google-signin").addEventListener("click", async () => {
  try {
    await loginWithGoogle();
  } catch (e) {
    document.getElementById('status').innerHTML = "Google sign-in failed: " + e.message;
  }
});

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  try {
    const userData = await login(email, password);
    localStorage.setItem("userData", JSON.stringify(userData));
    window.location.href = "index.html";
  } catch (e) {
    document.getElementById('status').innerHTML = "Login failed: " + e.message;
  }
});
