const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const { getFirestore, doc, getDoc, updateDoc } = require('firebase-admin/firestore');
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



app.use(express.static(__dirname));

function getRandomQuestion() {
  const idx = Math.floor(Math.random() * questions.length);
  return questions[idx];
}

io.on('connection', socket => {
  socket.on('registerUser', async ({ userId }) => {
    socket.userId = userId;
    // Fetch username from Firestore and store it on the socket
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      socket.username = userDoc.data().username;
    }
  });  
  console.log(`Client connected: ${socket.id}`);

  // PRIVATE ROOM LOGIC
socket.on('joinRoom', async incomingRoom => {
  const room = incomingRoom.toUpperCase();
  socket.room = room; 

  if (rooms[room] && rooms[room].length >= 2) {
    socket.emit('invalidRoom', 'Room is full or unavailable.');
    return;
  }

  if (!rooms[room] && socket.request.headers['referer'].includes('join')) {
    socket.emit('invalidRoom', 'Room does not exist.');
    return;
  }

  socket.join(room);
  if (!rooms[room]) rooms[room] = [];
  rooms[room].push(socket.id);

  if (rooms[room].length === 2) {
  // Get both sockets
  const player1Socket = io.sockets.sockets.get(rooms[room][0]);
  const player2Socket = io.sockets.sockets.get(rooms[room][1]);

  // Helper to get username and elo
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


  const player1Info = await getUserInfo(player1Socket);
  const player2Info = await getUserInfo(player2Socket);

  player1Socket.emit('playerInfo', {
    self: player1Info.username,
    opponent: player2Info.username,
    selfElo: player1Info.elo,
    opponentElo: player2Info.elo
  });
  player2Socket.emit('playerInfo', {
    self: player2Info.username,
    opponent: player1Info.username,
    selfElo: player2Info.elo,
    opponentElo: player1Info.elo
  });

  io.to(room).emit('startGame', getRandomQuestion());
}
});
  // PUBLIC MATCHMAKING
 socket.on('publicMatch', async () => {
  queue.push(socket);

  if (queue.length >= 2) {
    const player1 = queue.shift();
    const player2 = queue.shift();

    const roomCode = Math.random().toString(36).substring(2, 5).toUpperCase();
    rooms[roomCode] = [player1.id, player2.id];

    player1.join(roomCode);
    player2.join(roomCode);

    player1.room = roomCode;
    player2.room = roomCode;

    // Helper to get username and elo
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

    // Send usernames and ELOs to each player
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

    const question = getRandomQuestion();
    io.to(roomCode).emit('startGame', question);
  } else {
    socket.emit('waitingForOpponent');
  }
});


  // CODE SUBMISSION
socket.on('submitCode', async ({ code, won }) => {
  const room = socket.room;
  if (!room || !rooms[room]) return;

  const playerIndex = rooms[room].indexOf(socket.id);
  const isPlayer1 = playerIndex === 0;
  const opponentIndex = isPlayer1 ? 1 : 0;
  const opponentSocketId = rooms[room][opponentIndex];

  // Get user IDs from your mapping
  const myUserId = socket.userId;
  const opponentUserId = io.sockets.sockets.get(opponentSocketId)?.userId;

  if (won && myUserId && opponentUserId) {
    // Fetch current ELOs
    const myDoc = await db.collection("users").doc(myUserId).get();
    const opponentDoc = await db.collection("users").doc(opponentUserId).get();
    const myElo = myDoc.data().elo;
    const opponentElo = opponentDoc.data().elo;

    // Calculate new ELOs
    const [newWinnerElo, newLoserElo] = updateElo(myElo, opponentElo);

    // Update Firestore
    await db.collection("users").doc(myUserId).update({ elo: newWinnerElo });
    await db.collection("users").doc(opponentUserId).update({ elo: newLoserElo });

    // Send result and ELO to both clients
    socket.emit('result', 'You won!');
    socket.emit('eloUpdate', { elo: newWinnerElo, change: newWinnerElo - myElo });

    if (opponentSocketId) {
      io.to(opponentSocketId).emit('result', 'Opponent AC - You lose');
      io.to(opponentSocketId).emit('eloUpdate', { elo: newLoserElo, change: newLoserElo - opponentElo });
    }
  } else if (myUserId && opponentUserId) {
    // If not won, just send wrong answer to the submitter
    socket.emit('result', 'Wrong Answer');
  }
});


  // DISCONNECT CLEANUP
  socket.on('disconnect', () => {
    const room = socket.room;
    console.log(`Client disconnected: ${socket.id}`);

    if (room && rooms[room]) {
      rooms[room] = rooms[room].filter(id => id !== socket.id);
      if (rooms[room].length === 0) {
        delete rooms[room];
      } else {
        const opponentId = rooms[room][0];
        io.to(opponentId).emit('opponentLeft');
      }
    }

    // Also remove from queue if they disconnect during publicMatch
    queue = queue.filter(s => s.id !== socket.id);
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

function updateElo(winnerElo, loserElo) {
  const k = 32;
  const expectedWin = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  const newWinnerElo = Math.round(winnerElo + k * (1 - expectedWin));
  const newLoserElo = Math.round(loserElo + k * (0 - (1 - expectedWin)));
  return [newWinnerElo, newLoserElo];
}
