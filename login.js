import { login } from "./auth.js"; 

document.querySelector("form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  try {
   const userData = await login(email, password);
    localStorage.setItem("userData", JSON.stringify(userData)); // Save user data
    window.location.href = "index.html";
  } catch (e) {
    document.getElementById('status').innerHTML = "Login failed: " + e.message;
  }
});
