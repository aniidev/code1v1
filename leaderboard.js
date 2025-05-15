import { collection, query, orderBy, getDocs } from "https://esm.sh/firebase/firestore";
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://esm.sh/firebase/auth";

// Fetch all users ordered by elo descending
async function fetchLeaderboard() {
  const usersRef = collection(db, "users");
  const q = query(usersRef, orderBy("elo", "desc"));
  const snapshot = await getDocs(q);
  const users = [];
  snapshot.forEach(doc => users.push({ ...doc.data(), uid: doc.id }));
  return users;
}

// Render leaderboard rows and highlight the current user
function renderLeaderboard(users, currentUid) {
  const tbody = document.querySelector('.leaderboard-table tbody');
  tbody.innerHTML = "";
  users.forEach((user, idx) => {
    const initials = user.username
      ? user.username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : "??";
    const isCurrentUser = user.uid === currentUid;
    const tr = document.createElement('tr');
    if (isCurrentUser) tr.classList.add("your-rank-highlight");
    tr.innerHTML = `
      <td class="rank${idx < 3 ? ' top-rank' : ''}">${idx + 1}</td>
      <td>
        <div class="player-info">
          <div class="player-avatar">${initials}</div>
          <div class="player-name">${user.username || "Unknown"}</div>
        </div>
      </td>
      <td>--</td>
      <td>--</td>
      <td>--</td>
      <td>${user.elo ?? 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Update "Your Rank" and "Total Points" cards
function updateYourStats(users, currentUid) {
  const yourRankElem = document.getElementById('your-rank');
  const yourEloElem = document.getElementById('your-elo');
  // Find the user in the sorted list
  const idx = users.findIndex(u => u.uid === currentUid);
  if (idx !== -1) {
    yourRankElem.textContent = `#${idx + 1}`;
    yourEloElem.textContent = users[idx].elo ?? "--";
  } else {
    yourRankElem.textContent = "--";
    yourEloElem.textContent = "--";
  }
}

// Wait for auth, then fetch and render leaderboard
onAuthStateChanged(auth, async (user) => {
  const users = await fetchLeaderboard();
  renderLeaderboard(users, user?.uid);
  updateYourStats(users, user?.uid);
});
