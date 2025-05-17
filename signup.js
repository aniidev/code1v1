import { register } from "./auth.js";

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
    // Show loading message
    document.getElementById('status').innerHTML = "Creating your account...";
    
    // Register the user
    const userData = await register(email, password, username);
    
    // Success message
    document.getElementById('status').innerHTML = "Registration successful! Redirecting to homepage...";
    
    // Redirect to index page after a short delay
    setTimeout(() => {
      window.location.href = "index.html";
    }, 1000);
    
  } catch (e) {
    document.getElementById('status').innerHTML = "Registration failed: " + e.message;
  }
});