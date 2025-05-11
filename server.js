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
  // PRIVATE ROOM LOGIC
  socket.on('joinRoom', incomingRoom => {
    const room = incomingRoom.toUpperCase();

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
      io.to(room).emit('startGame', getRandomQuestion());
    }
  });

  // PUBLIC MATCHMAKING
  socket.on('publicMatch', () => {
    queue.push(socket);

    if (queue.length >= 2) {
      const player1 = queue.shift();
      const player2 = queue.shift();

      const roomCode = Math.random().toString(36).substring(2, 5).toUpperCase();
      rooms[roomCode] = [player1.id, player2.id];

      player1.join(roomCode);
      player2.join(roomCode);

      const question = getRandomQuestion();
      io.to(roomCode).emit('startGame', question);
    } else {
      socket.emit('waitingForOpponent');
    }
  });

  // CODE SUBMISSION
  socket.on('submitCode', ({ room, code, won }) => {
    const playerIndex = rooms[room]?.indexOf(socket.id);
    const isPlayer1 = playerIndex === 0;

    if (won) {
      socket.emit('result', 'You won!');
      const opponentId = rooms[room][isPlayer1 ? 1 : 0];
      if (opponentId) io.to(opponentId).emit('result', 'Opponent AC - You lose');
    } else {
      socket.emit('result', 'Wrong Answer');
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
