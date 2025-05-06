const socket = io();
let room = '';
let vsInterval = null;
let editor = null;
let currentQuestion = null;

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
  currentQuestion = question;
  document.getElementById('waitingScreen').style.display = 'none';
  document.getElementById('vsScreen').style.display = 'block';

  let timeLeft = 5;
  document.getElementById('vsTimer').innerText = `0:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
  const vsInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('vsTimer').innerText = `0:${timeLeft < 10 ? '0' : ''}${timeLeft}`;
    if (timeLeft <= 0) {
      clearInterval(vsInterval);
      document.getElementById('vsScreen').style.display = 'none';
      document.getElementById('game').style.display = 'block';

      // Display all question details
      document.getElementById('questionTitle').innerText = question.title;
      document.getElementById('questionDescription').innerText = question.description;

      const examplesHTML = question.examples.map(
        ex => `<pre><strong>Input:</strong> ${ex.input}\n<strong>Output:</strong> ${ex.output}</pre>`
      ).join('');
      document.getElementById('questionExamples').innerHTML = examplesHTML;

      const testCasesHTML = question.testCases.map(
        tc => `<pre><strong>Input:</strong> ${tc.input}\n<strong>Expected Output:</strong> ${tc.expectedOutput}</pre>`
      ).join('');
      document.getElementById('questionTestCases').innerHTML = testCasesHTML;
      startGameTimer();
    }
  }, 1000);
  setLanguage();
});

require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs' } });

require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '',
    language: 'javascript',
    theme: 'vs-dark',
    fontSize: 20,
    automaticLayout: true,
    minimap: { enabled: false }
  });
});

function submitCode() {
  const code = editor.getValue(); 
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
  
  function setLanguage() {
    if (!currentQuestion || !editor) return;
  
    const lang = document.getElementById('languageSelect').value;
  
    const monacoLangMap = {
      'javascript': 'javascript',
      'python': 'python',
      'cpp': 'cpp',
      'java': 'java'
    };
  
    const monacoLang = monacoLangMap[lang] || 'javascript';
  
    let rawSignature = currentQuestion.functionSignatures[lang] || '';
    let fullTemplate = '';
  
    switch (lang) {
      case 'python':
        fullTemplate = `${rawSignature}\n    # solution here`;
        break;
      case 'javascript':
        fullTemplate = `${rawSignature}\n  // solution here\n}`;
        break;
      case 'java':
        fullTemplate = `${rawSignature}\n    // solution here\n}`;
        break;
      case 'cpp':
        fullTemplate = `${rawSignature}\n    // solution here\n}`;
        break;
      default:
        fullTemplate = `${rawSignature}\n  // solution here`;
    }
  

    monaco.editor.setModelLanguage(editor.getModel(), monacoLang);
    editor.setValue(fullTemplate);
  }
  
  let gameTimerInterval = null;

function startGameTimer() {
  let totalSeconds = 15 * 60; // 15 minutes in seconds
  const timerElem = document.getElementById('timer');
  updateTimerDisplay(totalSeconds, timerElem);

  gameTimerInterval = setInterval(() => {
    totalSeconds--;
    updateTimerDisplay(totalSeconds, timerElem);

    if (totalSeconds <= 0) {
      clearInterval(gameTimerInterval);
      timerElem.innerText = "Time's up!";
      submitCode();
    }
  }, 1000);
}

function updateTimerDisplay(totalSeconds, elem) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  elem.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}