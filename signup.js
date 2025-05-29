import { register, signUpWithGoogle } from "./auth.js";

if(userData) window.location.href = "index.html";
document.querySelector("form").addEventListener("submit", async (event) => {
  event.preventDefault(); // This stops the form from submitting via POST
  
  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  
  // Clear any previous status messages
  document.getElementById('status').innerHTML = "";
  
  if (password !== confirmPassword) {
    document.getElementById('status').innerHTML = "Passwords do not match!";
    return;
  }
  
  try {
    document.getElementById('status').innerHTML = "Creating your account...";
    
    const userData = await register(email, password, username);
    
    document.getElementById('status').innerHTML = "Registration successful! Redirecting to homepage...";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);
    
  } catch (e) {
    document.getElementById('status').innerHTML = "Registration failed: " + e.message;
  }
});

document.getElementById("google-signup").addEventListener("click", async () => {
  try {
    await signUpWithGoogle();
  } catch (e) {
    document.getElementById('status').innerHTML = "Google sign-up failed: " + e.message;
  }
});