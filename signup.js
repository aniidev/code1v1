import { register } from "./auth.js";

document.querySelector("form").addEventListener("submit", async (event) => {
  event.preventDefault(); // This stops the POST[4][5][6]

  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    document.getElementById('status').innerHTML = "Passwords do not match!";
    return;
  }

  try {
    await register(email, password, username);
    document.getElementById('status').innerHTmL = "Registration successful! You can now log in.";
  } catch (e) {
    document.getElementById('status').innerHTML = "Registration failed: " + e.message;
  }
});
