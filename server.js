const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const { getFirestore, doc, getDoc, updateDoc } = require('firebase-admin/firestore');
const { Timestamp } = require('firebase-admin/firestore');
const db = getFirestore();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};
const questions = require('./questions.json');
let queue = [];
let onlineCount = 0;

app.use(express.static(__dirname));

function getRandomQuestion() {
  const idx = Math.floor(Math.random() * questions.length);
  return questions[idx];
}

// Clean up rooms that have been inactive for too long
function cleanupInactiveRooms() {
  const now = Date.now();
  Object.keys(rooms).forEach(roomCode => {
    const room = rooms[roomCode];
    if (room.gameOver && room.endTime && (now - room.endTime) > 300000) { // 5 minutes
      delete rooms[roomCode];
    }
  });
}

// Run cleanup every 5 minutes
setInterval(cleanupInactiveRooms, 300000);

io.on('connection', socket => {
  socket.on('registerUser', async ({ userId }) => {
    socket.userId = userId;
    // Fetch username from Firestore and store it on the socket
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      socket.username = userDoc.data().username;
    }
  });  
  onlineCount++;
  io.emit('onlineCount', onlineCount);
  console.log(`Client connected: ${socket.id}`);

  // PRIVATE ROOM LOGIC
socket.on('joinRoom', async (incoming) => {
  const room = incoming.room.toUpperCase();
  const joinType = incoming.type;
  socket.room = room;

  if (rooms[room] && rooms[room].length >= 2 && !rooms[room].gameOver) {
    socket.emit('invalidRoom', 'Room is full or unavailable.');
    return;
  }

  if (!rooms[room] && joinType === 'join') {
    socket.emit('invalidRoom', 'Room does not exist.');
    return;
  }

  socket.join(room);
  if (!rooms[room]) {
    rooms[room] = [];
    rooms[room].gameOver = false;
    rooms[room].status = 'countdown'; 
  }
  
  // If room exists but game is over, reset it for new players
  if (rooms[room].gameOver) {
    rooms[room] = [];
    rooms[room].gameOver = false;
    rooms[room].status = 'countdown';
  }
  
  rooms[room].push(socket.id);

  if (rooms[room].length === 2) {
    const [id1, id2] = rooms[room];
    const socket1 = io.sockets.sockets.get(id1);
    const socket2 = io.sockets.sockets.get(id2);

    if (socket1.userId === socket2.userId) {
      socket.emit('invalidRoom', 'You cannot play against yourself.');
      socket2.leave(room);
      rooms[room].pop();
      return;
    }

    const getUserInfo = async (sock) => {
      if (sock.userId) {
        const docSnap = await db.collection("users").doc(sock.userId).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          return {
            username: data.username || "Player",
            elo: data.elo || 1000
          };
        }
      }
      return { username: "Player", elo: 1000 };
    };

    const player1Info = await getUserInfo(socket1);
    const player2Info = await getUserInfo(socket2);

    socket1.emit('playerInfo', {
      self: player1Info.username,
      opponent: player2Info.username,
      selfElo: player1Info.elo,
      opponentElo: player2Info.elo
    });

    socket2.emit('playerInfo', {
      self: player2Info.username,
      opponent: player1Info.username,
      selfElo: player2Info.elo,
      opponentElo: player1Info.elo
    });

    const startTime = admin.firestore.Timestamp.now();
    const question = getRandomQuestion();

    await db.collection('matches').doc(room).set({
      startTime: startTime,
      players: [socket1.userId || 'anon1', socket2.userId || 'anon2'],
      type: 'private',
      status: 'ongoing'
    });

    io.to(room).emit('startGame', { question, startTime: startTime.toDate().getTime()  });
  }
});

  // PUBLIC MATCHMAKING
socket.on('publicMatch', async () => {
  queue.push(socket);

  if (queue.length >= 2) {
    const player1 = queue.shift();
    const player2 = queue.shift();

    if (player1.userId === player2.userId) {
      player2.emit('waitingForOpponent');
      queue.unshift(player2);
      return;
    }

    const roomCode = Math.random().toString(36).substring(2, 5).toUpperCase();
    rooms[roomCode] = [player1.id, player2.id];
    rooms[roomCode].gameOver = false;
    rooms[roomCode].status = 'countdown';

    player1.join(roomCode);
    player2.join(roomCode);

    player1.room = roomCode;
    player2.room = roomCode;

    const getUserInfo = async (sock) => {
      if (sock.userId) {
        const docSnap = await db.collection("users").doc(sock.userId).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          return {
            username: data.username || "Player",
            elo: data.elo || 1000
          };
        }
      }
      return { username: "Player", elo: 1000 };
    };

    const player1Info = await getUserInfo(player1);
    const player2Info = await getUserInfo(player2);

    player1.emit('playerInfo', {
      self: player1Info.username,
      opponent: player2Info.username,
      selfElo: player1Info.elo,
      opponentElo: player2Info.elo
    });

    player2.emit('playerInfo', {
      self: player2Info.username,
      opponent: player1Info.username,
      selfElo: player2Info.elo,
      opponentElo: player1Info.elo
    });

    const startTime = admin.firestore.Timestamp.now();
    const question = getRandomQuestion();

    await db.collection('matches').doc(roomCode).set({
      startTime: startTime,
      players: [player1.userId || 'anon1', player2.userId || 'anon2'],
      type: 'public',
      status: 'ongoing'
    });

    io.to(roomCode).emit('startGame', { question, startTime: startTime.toDate().getTime() });
  } else {
    socket.emit('waitingForOpponent');
  }
});

  // CODE SUBMISSION
socket.on('submitCode', async ({ code, won, timerEnd }) => {
  const room = socket.room;
  if (!room || !rooms[room]) return;

  const playerIndex = rooms[room].indexOf(socket.id);
  const isPlayer1 = playerIndex === 0;
  const opponentIndex = isPlayer1 ? 1 : 0;
  const opponentSocketId = rooms[room][opponentIndex];
  const opponentId = rooms[room].find(id => id !== socket.id);
  const opponentSocket = io.sockets.sockets.get(opponentId);
  const myUserId = socket.userId;
  const opponentUserId = io.sockets.sockets.get(opponentSocketId)?.userId;
  const formattedCode = code
  .replace(/{/g, ' {\n')
  .replace(/}/g, '\n}\n')
  .replace(/;/g, ';\n')
  .replace(/(\w)(=)/g, '$1 $2');

  if (timerEnd && myUserId && opponentUserId) {
    const myDocRef = db.collection("users").doc(myUserId);
    const myDoc = await myDocRef.get();
    const myData = myDoc.data();

    const myElo = myData.elo;
    let [newWinnerElo, newLoserElo] = updateElo(myElo, 1100);
    newLoserElo /= 1.25;
    await myDocRef.update({
      elo: newLoserElo,
      totalMatches: (myData.totalMatches || 0) + 1
    });

    socket.emit('result', "Time's up - You lose");
    socket.emit('eloUpdate', { elo: newLoserElo, change: newLoserElo - myElo});
    
    rooms[room].gameOver = true;
    rooms[room].endTime = Date.now(); // Add end time for cleanup
    await db.collection('matches').doc(room).update({ 
      status: 'ended',
      results: [
        { userId: socket.userId, username: socket.username, elo: newLoserElo, result: 'lose' },
        { userId: opponentSocket.userId, username: opponentSocket.username, elo: newWinnerElo, result: 'win' }
      ]
    });
    return;
  }
  else if (won && myUserId && opponentUserId) {
  // Fetch current ELOs and stats
  const myDocRef = db.collection("users").doc(myUserId);
  const opponentDocRef = db.collection("users").doc(opponentUserId);

  const myDoc = await myDocRef.get();
  const opponentDoc = await opponentDocRef.get();

  const myData = myDoc.data();
  const opponentData = opponentDoc.data();

  const myElo = myData.elo;
  const opponentElo = opponentData.elo;

  // Calculate new ELOs
  const [newWinnerElo, newLoserElo] = updateElo(myElo, opponentElo);

  // Calculate new stats
  const newWinnerWins = (myData.wins || 0) + 1;
  const newWinnerMatches = (myData.totalMatches || 0) + 1;

  const newLoserWins = opponentData.wins || 0;
  const newLoserMatches = (opponentData.totalMatches || 0) + 1;

  // Update Firestore for winner
  await myDocRef.update({
    elo: newWinnerElo,
    wins: newWinnerWins,
    totalMatches: newWinnerMatches
  });

  // Update Firestore for loser
  await opponentDocRef.update({
    elo: newLoserElo,
    wins: newLoserWins,
    totalMatches: newLoserMatches
  });

  // Send result and ELO to both clients
  socket.emit('result', 'You won!', formattedCode);
  socket.emit('eloUpdate', { elo: newWinnerElo, change: newWinnerElo - myElo });
  
  if (opponentSocketId) {
    io.to(opponentSocketId).emit('result', 'Opponent AC - You lose', formattedCode);
    io.to(opponentSocketId).emit('eloUpdate', { elo: newLoserElo, change: newLoserElo - opponentElo });
  }
  rooms[room].gameOver = true;
  rooms[room].endTime = Date.now(); // Add end time for cleanup
  await db.collection('matches').doc(room).update({
  status: 'ended',
  endTime: admin.firestore.Timestamp.now(),
  results: [
  { userId: socket.userId, username: socket.username, elo: newWinnerElo, result: 'win' },
  { userId: opponentSocket.userId, username: opponentSocket.username, elo: newLoserElo, result: 'lose' }
]
});

} else if (myUserId && opponentUserId) {
  socket.emit('result', 'Wrong Answer');
}
});

  // DISCONNECT CLEANUP
socket.on('disconnect', async () => {
  const room = socket.room;
  console.log(`Client disconnected: ${socket.id}`);
  onlineCount = Math.max(onlineCount - 1, 0);
  io.emit('onlineCount', onlineCount);

  // Remove from public match queue if in it
  queue = queue.filter(s => s.id !== socket.id);

  if (room && rooms[room] && !rooms[room].gameOver) {
    const opponentId = rooms[room].find(id => id !== socket.id);
    const opponentSocket = io.sockets.sockets.get(opponentId);

    // Handle ELO as if opponent won
    if (opponentSocket && socket.userId && opponentSocket.userId) {
      const myDocRef = db.collection("users").doc(socket.userId);
      const opponentDocRef = db.collection("users").doc(opponentSocket.userId);

      const myDoc = await myDocRef.get();
      const opponentDoc = await opponentDocRef.get();

      if (myDoc.exists && opponentDoc.exists) {
        const myData = myDoc.data();
        const opponentData = opponentDoc.data();

        const [newWinnerElo, newLoserElo] = updateElo(opponentData.elo, myData.elo);

        await opponentDocRef.update({
          elo: newWinnerElo,
          wins: (opponentData.wins || 0) + 1,
          totalMatches: (opponentData.totalMatches || 0) + 1
        });

        await myDocRef.update({
          elo: newLoserElo,
          wins: myData.wins || 0,
          totalMatches: (myData.totalMatches || 0) + 1
        });

        // CUSTOM MESSAGE BASED ON STATUS
        if (rooms[room].status === 'countdown') {
          opponentSocket.emit('result', 'Opponent disconnected - You win!');
        } else {
          opponentSocket.emit('result', 'Opponent disconnected - You win!');
        }

        opponentSocket.emit('eloUpdate', {
          elo: newWinnerElo,
          change: newWinnerElo - opponentData.elo
        });
        
        await db.collection('matches').doc(room).update({
          status: 'ended',
          endTime: admin.firestore.Timestamp.now(),
          results: [
            { userId: socket.userId, username: socket.username, elo: newLoserElo, result: 'lose' },
            { userId: opponentSocket.userId, username: opponentSocket.username, elo: newWinnerElo, result: 'win' }
          ]
        });
      }
    }

    // Mark game as over but don't delete room immediately
    rooms[room].gameOver = true;
    rooms[room].endTime = Date.now();
    
    // Remove disconnected player from room array
    const playerIndex = rooms[room].indexOf(socket.id);
    if (playerIndex > -1) {
      rooms[room].splice(playerIndex, 1);
    }
    
    if (opponentId) {
      io.to(opponentId).emit('opponentLeft');
    }
  } else if (room && rooms[room] && rooms[room].gameOver) {
    // If game is already over, just remove player from room
    const playerIndex = rooms[room].indexOf(socket.id);
    if (playerIndex > -1) {
      rooms[room].splice(playerIndex, 1);
    }
    
    // If room is empty after removing player, mark for cleanup
    if (rooms[room].length === 0) {
      rooms[room].endTime = Date.now();
    }
  }
});

socket.on("forfeit", async () => {
  const room = socket.room;
  console.log(`Client forfeited: ${socket.id}`);

  // Remove from public match queue
  queue = queue.filter(s => s.id !== socket.id);

  if (room && rooms[room]) {
    const opponentId = rooms[room].find(id => id !== socket.id);
    const opponentSocket = io.sockets.sockets.get(opponentId);

    if (opponentSocket && socket.userId && opponentSocket.userId && !rooms[room].gameOver) {
      // ... existing ELO update code ...
      const myDocRef = db.collection("users").doc(socket.userId);
      const opponentDocRef = db.collection("users").doc(opponentSocket.userId);

      const myDoc = await myDocRef.get();
      const opponentDoc = await opponentDocRef.get();

      if (myDoc.exists && opponentDoc.exists) {
        const myData = myDoc.data();
        const opponentData = opponentDoc.data();

        const [newWinnerElo, newLoserElo] = updateElo(opponentData.elo, myData.elo);
        const opponentEloChange = newWinnerElo - opponentData.elo;
        const myEloChange = newLoserElo - myData.elo;

        await opponentDocRef.update({
          elo: newWinnerElo,
          wins: (opponentData.wins || 0) + 1,
          totalMatches: (opponentData.totalMatches || 0) + 1
        });

        await myDocRef.update({
          elo: newLoserElo,
          wins: myData.wins || 0,
          totalMatches: (myData.totalMatches || 0) + 1
        });

        opponentSocket.emit('result', 'Opponent Forfeit');
        opponentSocket.emit('eloUpdate', {
          elo: newWinnerElo,
          change: opponentEloChange
        });

        socket.emit('result', 'Forfeit');
        socket.emit('eloUpdate', {
          elo: newLoserElo,
          change: myEloChange
        });
        
        await db.collection('matches').doc(room).update({
          status: 'ended',
          endTime: admin.firestore.Timestamp.now(),
          results: [
            { userId: socket.userId, username: socket.username, elo: newLoserElo, result: 'lose' },
            { userId: opponentSocket.userId, username: opponentSocket.username, elo: newWinnerElo, result: 'win' }
          ]
        });
      }
    }
    
    // Mark game as over
    rooms[room].gameOver = true;
    rooms[room].endTime = Date.now();
    
    // IMPORTANT: DON'T remove from room array - let both players stay in room for potential rematch
    // Remove this line: rooms[room].splice(playerIndex, 1);
    
    if (opponentId) {
      io.to(opponentId).emit('opponentLeft');
    }
  }

  // DON'T force disconnect - let the socket stay connected for potential rematch
  // socket.disconnect(true); // Remove this line completely
});

socket.on('testCaseUpdate', ({ passed, total }) => {
  const room = socket.room;
  if (!room || !rooms[room]) return;

  // Update sender's display
  socket.emit('caseProgress', { passed, total });

  // Notify opponent
  const opponentId = rooms[room].find(id => id !== socket.id);
  if (opponentId) {
    io.to(opponentId).emit('opponentCaseProgress', {
      passed,
      total,
      name: socket.username || "Opponent"
    });
  }
});

socket.on('gameStarted', () => {
  const room = socket.room;
  if (room && rooms[room]) {
    rooms[room].status = 'in-game';
  }
});

socket.on('requestRematch', async () => {
  console.log(`Received rematch request from ${socket.id}`);
  const room = socket.room;
  if (!room || !rooms[room]) {
    console.log('No room found for rematch request');
    return;
  }

  // Track rematch requests
  if (!rooms[room].rematchRequests) rooms[room].rematchRequests = {};
  rooms[room].rematchRequests[socket.id] = true;

  // FIXED: Check all connected sockets in the room, not just the room array
  let opponentSocket = null;
  let opponentId = null;
  
  // Get all sockets in this room
  const socketsInRoom = io.sockets.adapter.rooms.get(room);
  
  if (socketsInRoom) {
    // Find opponent among connected sockets in the room
    for (const socketId of socketsInRoom) {
      if (socketId !== socket.id) {
        const candidateSocket = io.sockets.sockets.get(socketId);
        if (candidateSocket && candidateSocket.connected) {
          opponentSocket = candidateSocket;
          opponentId = socketId;
          break;
        }
      }
    }
  }
  
  if (!opponentSocket) {
    console.log('No connected opponent found in room');
    socket.emit('rematchUnavailable', 'Opponent Left');
    return;
  }

  // opponentSocket already found above

  // Notify opponent about rematch request
  opponentSocket.emit('opponentRequestedRematch');
  console.log(`Notified opponent ${opponentId} about rematch request`);

  // If both have requested, start a new game
  const rematchRequests = Object.keys(rooms[room].rematchRequests);
  console.log(`Current rematch requests: ${rematchRequests.length}`);
  
  if (rematchRequests.length === 2) {
    console.log('Both players requested rematch, starting new game');
    
    // Reset room for new game
    rooms[room].gameOver = false;
    rooms[room].status = 'countdown';
    rooms[room].rematchRequests = {};
    delete rooms[room].endTime;

    // Ensure both players are in the room array
    rooms[room] = [socket.id, opponentId];

    const socket1 = socket;
    const socket2 = opponentSocket;

    // Get fresh player info
    const getUserInfo = async (sock) => {
      if (sock.userId) {
        const docSnap = await db.collection("users").doc(sock.userId).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          return {
            username: data.username || "Player",
            elo: data.elo || 1000
          };
        }
      }
      return { username: "Player", elo: 1000 };
    };

    const player1Info = await getUserInfo(socket1);
    const player2Info = await getUserInfo(socket2);

    // Send updated player info
    socket1.emit('playerInfo', {
      self: player1Info.username,
      opponent: player2Info.username,
      selfElo: player1Info.elo,
      opponentElo: player2Info.elo
    });

    socket2.emit('playerInfo', {
      self: player2Info.username,
      opponent: player1Info.username,
      selfElo: player2Info.elo,
      opponentElo: player1Info.elo
    });

    const question = getRandomQuestion();
    const startTime = admin.firestore.Timestamp.now();

    // Create new match document
    await db.collection('matches').doc(room).set({
      startTime: startTime,
      players: [socket1.userId || 'anon1', socket2.userId || 'anon2'],
      type: 'rematch',
      status: 'ongoing'
    });

    // Start the new game
    io.to(room).emit('startGame', { question, startTime: startTime.toDate().getTime() });
    console.log('New rematch game started');
  }
});
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

function updateElo(winnerElo, loserElo) {
  const k = 64;
  const expectedWin = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const newWinnerElo = Math.ceil(winnerElo + k * (1 - expectedWin));
  const newLoserElo = Math.ceil(loserElo + k * (0 - (1 - expectedWin)));
  return [newWinnerElo, newLoserElo];
}

app.get('/api/matches', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    const snapshot = await db.collection('matches')
      .where('players', 'array-contains', userId)
      .where('status', '==', 'ended')
      .orderBy('startTime', 'desc')
      .limit(10)
      .get();

    const matches = [];
    const opponentIds = new Set();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.results) return;
      const myResult = data.results.find(r => r.userId === userId);
      const opponentResult = data.results.find(r => r.userId !== userId);
      if (opponentResult) opponentIds.add(opponentResult.userId);
      matches.push({
        opponentId: opponentResult ? opponentResult.userId : 'Unknown',
        myElo: myResult ? myResult.elo : 'N/A',
        opponentElo: opponentResult ? opponentResult.elo : 'N/A',
        result: myResult ? myResult.result : 'N/A',
        startTime: data.startTime ? data.startTime.toDate() : null
      });
    });

    // Batch fetch opponent usernames
    const opponentIdArr = Array.from(opponentIds);
    const userDocs = opponentIdArr.length
      ? await db.collection('users').where(
          admin.firestore.FieldPath.documentId(), 'in', opponentIdArr
        ).get()
      : { docs: [] };

    const idToName = {};
    userDocs.docs.forEach(doc => {
      idToName[doc.id] = doc.data().username || 'Unknown';
    });

    // Attach usernames to matches
    matches.forEach(match => {
      match.opponentName = idToName[match.opponentId] || 'Unknown';
    });

    res.json(matches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});