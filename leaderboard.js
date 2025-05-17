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
    const winRate = (user.totalMatches && user.wins)
      ? Math.round((user.wins / user.totalMatches) * 100)
      : 0;
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

// Update "Your Rank", "Wins", "Total Matches", "Total Points"
function updateYourStats(users, currentUid) {
  const yourRankElem = document.getElementById('your-rank');
  const yourEloElem = document.getElementById('your-elo');
  const yourWinsElem = document.getElementById('your-wins');
  const yourMatchesElem = document.getElementById('your-matches');
  const idx = users.findIndex(u => u.uid === currentUid);
  if (idx !== -1) {
     const user = users[idx];
    const rank = idx + 1;
    const topPercent = calculateTopPercent(rank, users.length);
    yourRankElem.innerHTML = `#${rank} <span class="top-percent">${topPercent}</span>`;
    yourEloElem.textContent = user.elo ?? "--";
    yourWinsElem.textContent = user.wins ?? "0";
    yourMatchesElem.textContent = user.totalMatches ?? "0";
  } else {
    yourRankElem.textContent = "Not Signed In";
    yourEloElem.textContent = "Not Signed In";
    yourWinsElem.textContent = "--";
    yourMatchesElem.textContent = "--";
  }
}

// Wait for auth, then fetch and render leaderboard
onAuthStateChanged(auth, async (user) => {
  const users = await fetchLeaderboard();
  renderLeaderboard(users, user?.uid);
  updateYourStats(users, user?.uid);
});

function calculateTopPercent(rank, totalUsers) {
  if (!rank || !totalUsers) return "";
  return `Top ${(rank / totalUsers * 100).toFixed(2)}%`;
}
