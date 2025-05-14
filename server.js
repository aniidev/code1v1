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

    // Wait for usernames
    const getUsername = async (sock) => {
      if (sock.username) return sock.username;
      if (sock.userId) {
        const docSnap = await db.collection("users").doc(sock.userId).get();
        return docSnap.exists ? docSnap.data().username : "Player";
      }
      return "Player";
    };
    const player1Username = await getUsername(player1Socket);
    const player2Username = await getUsername(player2Socket);

    // Send usernames to each player
    player1Socket.emit('playerInfo', { self: player1Username, opponent: player2Username });
    player2Socket.emit('playerInfo', { self: player2Username, opponent: player1Username });

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

    // Wait for both usernames to be loaded (in case registerUser hasn't finished)
    const getUsername = async (sock) => {
      if (sock.username) return sock.username;
      if (sock.userId) {
        const docSnap = await db.collection("users").doc(sock.userId).get();
        return docSnap.exists ? docSnap.data().username : "Player";
      }
      return "Player";
    };
    const player1Username = await getUsername(player1);
    const player2Username = await getUsername(player2);

    // Send usernames to each player
    player1.emit('playerInfo', { self: player1Username, opponent: player2Username });
    player2.emit('playerInfo', { self: player2Username, opponent: player1Username });

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


