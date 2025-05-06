const socket = io();
let room = '';
let vsInterval = null;

function createRoom() {
  room = Math.random().toString(36).substring(2, 5).toUpperCase();
  socket.emit('joinRoom', room);
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('waitingScreen').style.display = 'block';
  document.getElementById('waitingRoomCode').innerText = room;
}

function joinRoom() {
  room = document.getElementById('roomInput').value.toUpperCase().trim();
  if (room.length !== 3) {
    alert('Room code must be 3 characters!');
    return;
  }
  socket.emit('joinRoom', room);
  document.getElementById('lobby').style.display = 'none';
}


socket.on('startGame', (question) => {

  document.getElementById('waitingScreen').style.display = 'none';

  document.getElementById('vsScreen').style.display = 'block';

  let timeLeft = 30;
  document.getElementById('vsTimer').innerText = `0:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
  const vsInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('vsTimer').innerText = `0:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
    if (timeLeft <= 0) {
      clearInterval(vsInterval);
      document.getElementById('vsScreen').style.display = 'none';
      document.getElementById('game').style.display = 'block';
      document.getElementById('questionTitle').innerText = question.title;
    }
  }, 1000);
});

function submitCode() {
  const code = document.getElementById('codeInput').value;
  socket.emit('submitCode', { room, code });
  document.getElementById('status').innerText = 'Submitted...';
}

socket.on('result', (msg) => {
  document.getElementById('status').innerText = msg;
});
socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
  });

  socket.on('invalidRoom', (msg) => {
    alert(msg);
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('game').style.display = 'none';
  });
  