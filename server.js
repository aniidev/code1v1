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

  socket.on('submitCode', ({ room, code }) => {
    const win = Math.random() > 0.5 ? 'Player 1' : 'Player 2';
    io.to(room).emit('result', `${win} wins!`);
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});