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
    minimap: { enabled: false },
    lineNumbersMinChars: 2 
  });
});

function submitCode() {
  const code = editor.getValue();
  
  socket.emit('submitCode', { room, code });
  document.getElementById('status').innerText = 'Submitted...';
}


async function runCode() {
  const code = editor.getValue();
  const lang = document.getElementById('languageSelect').value;
  const userInput = document.getElementById('codeInput')?.value || '';
  
  document.getElementById('status').innerText = 'Running...';
  document.getElementById('output').innerHTML = '<pre class="info">Sending request to Piston API...</pre>';
  
  try {

    const pistonURL = "https://emkc.org/api/v2/piston/execute";
    
    
    
    
    const languageVersions = {
      "javascript": "18.15.0",
      "python": "3.10.0",
      "java": "15.0.2",
      "cpp": "10.2.0"
    };
    

    const fileExtensions = {
      "javascript": "js",
      "python": "py",
      "java": "java",
      "cpp": "cpp"
    };
    
    // Request data
    const requestData = {
      language: lang,
      version: languageVersions[lang] || "*", // Use specified version or latest
      files: [
        {
          name: `main.${fileExtensions[lang] || lang}`,
          content: code
        }
      ],
      stdin: "",
      args: [],
      compile_timeout: 10000,
      run_timeout: 3000
    };
    
    // Log request for debugging
    console.log("Sending request to Piston API:", requestData);
    document.getElementById('output').innerHTML += '<pre>Request sent. Waiting for response...</pre>';
    
    // Send request to Piston API
    const response = await fetch(pistonURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const result = await response.json();
    

    // Format and display the result
    let statusMessage = "";
    let outputHTML = "";
    
    // Display the raw response for debugging
    outputHTML += `<pre style="color: blue; font-size: 12px;">API Response: ${JSON.stringify(result, null, 2)}</pre>`;
    
    if (result.compile && result.compile.stderr) {
      statusMessage = "Compilation Error";
      outputHTML += `<pre style="color: red">${result.compile.stderr}</pre>`;
    } 
    
    if (result.run) {
      if (result.run.stderr && result.run.stderr.trim() !== "") {
        statusMessage = "Runtime Error";
        outputHTML += `<pre style="color: red">${result.run.stderr}</pre>`;
      }
      
      if (result.run.stdout && result.run.stdout.trim() !== "") {
        statusMessage = "Success!";
        outputHTML += `<pre style="color: green">${result.run.stdout}</pre>`;
      } else {
        if (!statusMessage) statusMessage = "No Output";
        outputHTML += `<pre>(No standard output)</pre>`;
      }
    } else {
      if (!statusMessage) statusMessage = "Execution Complete";
      outputHTML += `<pre>No run results returned from API.</pre>`;
    }
    
    document.getElementById('status').innerText = statusMessage;
    document.getElementById('output').innerHTML = outputHTML;
    
  } catch (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
    console.error('Error executing code:', error);
  }
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

  // Check if the language is valid; if not, default to 'javascript'
  const monacoLang = monacoLangMap[lang] || 'javascript';

  // Use optional chaining and provide defaults if keys are missing
  const rawSignature = currentQuestion.functionSignatures?.[lang] || '';
  const funcName = currentQuestion.functionName || 'functionName';
  const inputs = currentQuestion.inputs?.[lang] || {};
  const returnType = currentQuestion.output || '';

  // Example to check if we have the expected input for the language
  console.log('Function Name:', funcName);
  console.log('Inputs:', inputs);
  console.log('Return Type:', returnType);

  let fullTemplate = '';

  // Generate a function template for the selected language
  switch (lang) {
    case 'python':
      fullTemplate = `${rawSignature}\n    # solution here\n    pass`;
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
      fullTemplate = `// Missing signature`;
  }

  // Set the language in Monaco Editor and insert the function template
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