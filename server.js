const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {};
const questions = require('./questions.json');

app.use(express.static(__dirname));

function getRandomQuestion() {
  const idx = Math.floor(Math.random() * questions.length);
  return questions[idx];
}

io.on('connection', socket => {
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

  socket.on('submitCode', ({ room, code, won }) => {
  const playerIndex = rooms[room].indexOf(socket.id);
  const isPlayer1 = playerIndex === 0;
  
  if (won) {
    socket.emit('result', 'You won!');
    
    const otherPlayerIndex = isPlayer1 ? 1 : 0;
    if (rooms[room][otherPlayerIndex]) {
      io.to(rooms[room][otherPlayerIndex]).emit('result', 'Opponent AC - You lose');
    }
  } else {

    socket.emit('result', 'Wrong Answer');
  }
});
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});