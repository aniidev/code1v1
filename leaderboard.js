import { collection, query, getDocs } from "https://esm.sh/firebase/firestore";
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://esm.sh/firebase/auth";

// Fetch all users (no ordering here, we sort in JS)
async function fetchLeaderboard() {
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);
  const users = [];
  snapshot.forEach(doc => users.push({ ...doc.data(), uid: doc.id }));
  return users;
}

// Calculate win rate for each user (to sort by)
function getWinRate(user) {
  if (user.totalMatches && user.wins) {
    return user.wins / user.totalMatches;
  }
  return 0;
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
    const winRate = Math.round(getWinRate(user) * 100);
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
      <td>
        <div class="stats">
          <span>${winRate}%</span>
          <div class="win-rate-bar">
            <div class="win-rate-progress" style="width: ${winRate}%"></div>
          </div>
        </div>
      </td>
      <td>${user.totalMatches ?? 0}</td>
      <td>--</td>
      <td>${user.elo ?? 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Update "Your Rank" and "Your Elo"
function updateYourStats(users, currentUid) {
  const yourRankElem = document.getElementById('your-rank');
  const yourEloElem = document.getElementById('your-elo');
  const idx = users.findIndex(u => u.uid === currentUid);
  if (idx !== -1) {
    const user = users[idx];
    const rank = idx + 1;
    const topPercent = calculateTopPercent(rank, users.length);
    yourRankElem.innerHTML = `#${rank} <span class="top-percent">${topPercent}</span>`;
    yourEloElem.textContent = user.elo ?? "--";
  } else {
    yourRankElem.textContent = "--";
    yourEloElem.textContent = "--";
  }
}

function calculateTopPercent(rank, totalUsers) {
  if (!rank || !totalUsers) return "";
  return `Top ${(rank / totalUsers * 100).toFixed(2)}%`;
}

// Main function to fetch, sort and render
async function loadAndRenderLeaderboard(sortBy = "elo") {
  const users = await fetchLeaderboard();

  // Sort users based on selected criteria
  users.sort((a, b) => {
    if (sortBy === "totalMatches") {
      return (b.totalMatches ?? 0) - (a.totalMatches ?? 0);
    } else if (sortBy === "winRate") {
      return getWinRate(b) - getWinRate(a);
    } else { // default Elo
      return (b.elo ?? 0) - (a.elo ?? 0);
    }
  });

  const currentUser = auth.currentUser;
  renderLeaderboard(users, currentUser?.uid);
  updateYourStats(users, currentUser?.uid);
}

// Wait for auth, then initial load + set up filter listener
onAuthStateChanged(auth, user => {
  if (!user) return;

  const categoryFilter = document.getElementById('categoryFilter');
  categoryFilter.addEventListener('change', () => {
    loadAndRenderLeaderboard(categoryFilter.value);
  });

  // Initial load with default sort by elo
  loadAndRenderLeaderboard(categoryFilter.value);
});