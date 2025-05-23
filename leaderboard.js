import { collection, query, getDocs } from "https://esm.sh/firebase/firestore";
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://esm.sh/firebase/auth";

let currentPage = 1;
const usersPerPage = 10;
let globalUsers = [];

async function fetchLeaderboard() {
  const usersRef = collection(db, "users");
  const snapshot = await getDocs(usersRef);
  const users = [];
  snapshot.forEach(doc => users.push({ ...doc.data(), uid: doc.id }));
  return users;
}


function getWinRate(user) {
  if (user.totalMatches && user.wins) {
    return user.wins / user.totalMatches;
  }
  return 0;
}


function renderLeaderboard(users, currentUid, page = 1) {
  const tbody = document.querySelector('.leaderboard-table tbody');
  tbody.innerHTML = "";

  const start = (page - 1) * usersPerPage;
  const end = start + usersPerPage;
  const pageUsers = users.slice(start, end);

  pageUsers.forEach((user, idx) => {
    const overallIndex = start + idx;
    const initials = user.username
      ? user.username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
      : "??";
    const isCurrentUser = user.uid === currentUid;
    const winRate = Math.round(getWinRate(user) * 100);
    const tr = document.createElement('tr');
    if (isCurrentUser) tr.classList.add("your-rank-highlight");
    tr.innerHTML = `
      <td class="rank${overallIndex < 3 ? ' top-rank' : ''}">${overallIndex + 1}</td>
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

  updatePagination(users.length);
}


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


async function loadAndRenderLeaderboard(sortBy = "elo") {
  const users = await fetchLeaderboard();

  users.sort((a, b) => {
    if (sortBy === "totalMatches") {
      return (b.totalMatches ?? 0) - (a.totalMatches ?? 0);
    } else if (sortBy === "winRate") {
      return getWinRate(b) - getWinRate(a);
    } else {
      return (b.elo ?? 0) - (a.elo ?? 0);
    }
  });

  globalUsers = users;
  currentPage = 1;
  const currentUser = auth.currentUser;
  renderLeaderboard(globalUsers, currentUser?.uid, currentPage);
  updateYourStats(globalUsers, currentUser?.uid);
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

function updatePagination(totalUsers) {
  const pagination = document.querySelector('.pagination');
  pagination.innerHTML = "";

  const totalPages = Math.ceil(totalUsers / usersPerPage);

  const createButton = (label, page) => {
    const button = document.createElement('button');
    button.textContent = label;
    if (page === currentPage) {
      button.classList.add('active');
    }
    button.addEventListener('click', () => {
      if (page >= 1 && page <= totalPages && page !== currentPage) {
        currentPage = page;
        renderLeaderboard(globalUsers, auth.currentUser?.uid, currentPage);
      }
    });
    return button;
  };

  pagination.appendChild(createButton('<', currentPage - 1));

  for (let i = 1; i <= totalPages; i++) {
    pagination.appendChild(createButton(i, i));
  }

  pagination.appendChild(createButton('>', currentPage + 1));
}


