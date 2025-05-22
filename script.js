const socket = io();
let room = '';
let vsInterval = null;
let editor = null;
let currentQuestion = null;
let gameTimerInterval = null;
let won = false;
let username = "Player";
let opponentName = "Opponent";
const userData = JSON.parse(localStorage.getItem("userData"));
let opponentPassed = 0;
let userPassed = 0;

if (userData) {
  document.getElementById("userHeader").textContent =
    `${userData.username}`;
}
else
{
  document.getElementById("userHeader").textContent =
    ``;
}


socket.on('playerInfo', ({ self, opponent, selfElo, opponentElo }) => {
  document.getElementById("user").textContent = self;
  document.getElementById("opponent").textContent = opponent;
  document.getElementById("userElo").textContent = `rating: ${selfElo}`;
  document.getElementById("opponentElo").textContent = `rating: ${opponentElo}`;
  opponentName = opponent;
  username = self;
});

socket.on('registerUser', async ({ userId }) => {
  socket.userId = userId;
    if (!userId) {
    console.error('registerUser: userId is missing or empty!');
    return;
  }
  const userDoc = await db.collection("users").doc(userId).get();
  if (userDoc.exists) {
    socket.username = userDoc.data().username;
  } else {
    socket.username = "Player"; // fallback
  }
});
window.addEventListener('DOMContentLoaded', () => {
  const userData = JSON.parse(localStorage.getItem("userData"));
  if (userData && userData.uid) {
    socket.emit('registerUser', { userId: userData.uid });
    document.getElementById('signUpBtn').style.display = 'none';
    document.getElementById('logInBtn').style.display = 'none';
    document.getElementById('logOutBtn').style.display = 'block';
  } else {
      document.getElementById('signUpBtn').style.display = 'block';
      document.getElementById('logInBtn').style.display = 'block';
      document.getElementById('logOutBtn').style.display = 'none';
  }
});

function createRoom() {
  if(userData)
  {
    room = Math.random().toString(36).substring(2, 5).toUpperCase();
    socket.emit('joinRoom',{
      room: room,
      type: 'create' 
    });
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('waitingScreen').style.display = 'block';
    document.getElementById('waitingRoomCode').innerText = room;

  }
  else
  {
    window.location.href = 'login.html';
  }
}

function joinRoom() {
  if (userData) {
    const room = document.getElementById('roomInput').value.toUpperCase().trim();
    if (room.length !== 3) {
      alert('Room code must be 3 characters!');
      return;
    }
    socket.emit('joinRoom', {
      room: room,
      type: 'join'
    });
        document.getElementById('lobby').style.display = 'none';

  } else {
    window.location.href = 'login.html';
  }
}


socket.on('startGame', (question) => {
  currentQuestion = question;
  document.getElementById('waitingScreen').style.display = 'none';
  document.getElementById('publicWaiting').style.display = 'none';
  document.getElementById('header').style.display = 'none';
  document.getElementById('vsScreen').style.display = 'block';
  document.getElementById('userDisplay').innerHTML = username;
  document.getElementById('opponentDisplay').innerHTML = opponentName;
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
      startGameTimer();
    }
  }, 1000);
  setLanguage();
});

require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.34.1/min/vs' } });
require(['vs/editor/editor.main'], function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: '',
    language: 'java',
    theme: 'vs-dark',
    fontSize: 20,
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbersMinChars: 2 
  });
});

function submitCode() {
  const code = editor.getValue();
  runCode();
  socket.emit('submitCode', { room, code, won});
  document.getElementById('status').innerText = 'Submitted...';
}


socket.on('result', (msg) => {
  console.log('Received result:', msg);
  if(msg === "Wrong Answer")
  {
    document.getElementById('status').innerHTML = 'Wrong Answer';
  }
  else
  {
    document.getElementById('game').style.display = 'none';
    document.getElementById('endScreen').style.display = 'block';
    document.getElementById('end-status').innerText = msg;
  }
    
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});


socket.on('invalidRoom', (msg) => {
  console.log("invalid room");
  alert(msg);

});

socket.on('eloUpdate', ({ elo, change }) => {
  document.getElementById('elo-value').textContent = elo;
  userData.elo = elo;
  localStorage.setItem("userData", JSON.stringify(userData));
  const eloChangeElem = document.getElementById('elo-change');
  eloChangeElem.style.color = change > 0 ? 'green' : 'red';
  eloChangeElem.textContent = (change > 0 ? '+' : '') + change;
});

function findPublicMatch() {
  if(userData)
  {
    socket.emit('publicMatch');
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('publicWaiting').style.display = 'block';
  }
  else
  {
    window.location.href = 'login.html';
  }
}

socket.on('waitingForOpponent', () => {
  document.getElementById('publicWaiting').innerText = 'Finding an opponent...';
});


function returnLobby()
{
  opponentPassed = 0;
  userPassed = 0;
  window.location.reload(true);
  document.getElementById('lobby').style.display = 'block';
  document.getElementById('header').style.display = 'block';
  document.getElementById('endScreen').style.display = 'none';
    
}
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

function normalizeOutput(output, expectedType) {
  let out = output.trim();
  if (expectedType.includes('List') || expectedType.includes('[]') || expectedType.includes('vector')) {
    try {
      out = out.replace(/[\[\]]/g, '').split(/,|\s+/).filter(Boolean).map(x => isNaN(x) ? x.replace(/['"]/g, '') : Number(x));
      return out;
    } catch (e) { return out; }
  }
  if (expectedType === 'int' || expectedType === 'number') {
    return Number(out);
  }
  if (expectedType === 'float' || expectedType === 'double') {
    return parseFloat(out);
  }
  if (expectedType === 'bool' || expectedType === 'boolean') {
    return out.toLowerCase() === 'true';
  }
  return out.replace(/^['"]|['"]$/g, '');
}

// Generate argument list for function call in each language
function formatArg(val, type, lang) {
  const isList = /\[\]|\bList\b|\bvector\b/.test(type);

  if (isList) {
    // Determine element type
    let elemType;
    if (/int|number/.test(type)) elemType = 'number';
    else if (/bool|boolean/.test(type)) elemType = 'boolean';
    else elemType = 'string';

    // Format elements
    let elems = val.map(v => {
      if (elemType === 'string') return `"${v}"`;
      if (elemType === 'boolean') return (lang === 'python' ? (v ? 'True' : 'False') : (v ? 'true' : 'false'));
      return v;
    }).join(', ');

    // Python/JavaScript
    if (lang === 'python' || lang === 'javascript') {
      return `[${elems}]`;
    }

    // Java
    if (lang === 'java') {
      if (/\[\]$/.test(type)) {
        if (elemType === 'number') return `new int[]{${elems}}`;
        if (elemType === 'boolean') return `new boolean[]{${elems}}`;
        if (elemType === 'string') return `new String[]{${elems}}`;
        return `new int[]{${elems}}`;
      } else {
        return `Arrays.asList(${elems})`;
      }
    }

    // C++
    if (lang === 'cpp') {
      return `{${elems}}`;
    }
  }

  // Single values
  if (typeof val === 'string') return `"${val.replace(/"/g, '\\"')}"`;
  if (typeof val === 'boolean') return lang === 'python' ? (val ? 'True' : 'False') : (val ? 'true' : 'false');
  return val;
}

function parseInputValue(value, type) {
  try {
    // Handle arrays/lists/vectors
    if (type && (type.includes('List') || type.includes('[]') || type.includes('vector'))) {
      let arrStr = value.trim();
      if (arrStr.startsWith('[') && arrStr.endsWith(']')) {
        arrStr = arrStr.slice(1, -1);
      }
      let elems = arrStr.split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
      
      if (/int|number/.test(type)) {
        return elems.map(e => Number(e));
      }
      if (/bool|boolean/.test(type)) {
        return elems.map(e => {
          if (typeof e === 'boolean') return e;
          return e.toLowerCase() === 'true';
        });
      }
      return elems;
    }
    
    if (type && (type === 'bool' || type === 'boolean')) {
      if (typeof value === 'boolean') return value;
      return value.trim().toLowerCase() === 'true';
    }
    
    if (type && (type === 'int' || type === 'number')) {
      return Number(value);
    }
    
    return value.replace(/^['"]|['"]$/g, '');
  } catch {
    return value;
  }
}

function parseTestCaseInputs(tcInput, argNames) {
  // Handle the case where we have multiple parameters separated by comma
  // Split smartly to handle arrays within the input
  let depth = 0;
  let current = '';
  let parts = [];
  
  for (let i = 0; i < tcInput.length; i++) {
    const char = tcInput[i];
    if (char === '[') depth++;
    else if (char === ']') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  
  // If we have the right number of arguments, return them
  if (parts.length === argNames.length) {
    return parts;
  }
  
  // Fallback: split by lines if comma splitting doesn't work
  const lines = tcInput.split('\n').map(l => l.trim()).filter(Boolean);
  if (argNames.length === 1) return [lines.join('\n')];
  return lines.length >= argNames.length ? lines.slice(0, argNames.length) : parts;
}

function generateTestHarness(lang, funcName, testCases, inputTypes, returnType) {
  const argNames = Object.keys(inputTypes);

  // --- PYTHON ---
  if (lang === 'python') {
    let harness = '\n# === Test Harness ===\n';
    harness += 'test_cases = [\n';
    testCases.forEach(tc => {
      const inputs = parseTestCaseInputs(tc.input, argNames);
      const formattedInputs = inputs.map((v, i) => {
        const argType = inputTypes[argNames[i]];
        const parsedValue = parseInputValue(v, argType);
        return formatArg(parsedValue, argType, lang);
      });
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType), returnType, lang);
      
      if (argNames.length === 1) {
        harness += `    (${formattedInputs[0]}, ${expected}),\n`;
      } else {
        harness += `    ((${formattedInputs.join(', ')}), ${expected}),\n`;
      }
    });
    harness += ']\n';
    harness += `for idx, (inputs, expected) in enumerate(test_cases, 1):\n`;
    harness += `    try:\n`;
    if (argNames.length === 1) {
      harness += `        result = ${funcName}(inputs)\n`;
    } else {
      harness += `        result = ${funcName}(*inputs)\n`;
    }
    harness += `        print(f"Case {idx}: {'PASS' if result == expected else 'FAIL'} | Expected: {expected} | Output: {result}")\n`;
    harness += `    except Exception as e:\n`;
    harness += `        print(f"Case {idx}: ERROR | {str(e)}")\n`;
    return harness;
  }
  
  // --- JAVASCRIPT ---
  if (lang === 'javascript') {
    let harness = '\n// === Test Harness ===\n';
    harness += 'const testCases = [\n';
    testCases.forEach(tc => {
      const inputs = parseTestCaseInputs(tc.input, argNames);
      const formattedInputs = inputs.map((v, i) => {
        const argType = inputTypes[argNames[i]];
        const parsedValue = parseInputValue(v, argType);
        return formatArg(parsedValue, argType, lang);
      });
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType), returnType, lang);
      harness += `  { inputs: [${formattedInputs.join(', ')}], expected: ${expected} },\n`;
    });
    harness += '];\n';
    harness += `
testCases.forEach(({ inputs, expected }, idx) => {
  try {
    const result = ${funcName}(...inputs);
    console.log(\`Case \${idx + 1}: \${result === expected ? 'PASS' : 'FAIL'} | Expected: \${expected} | Output: \${result}\`);
  } catch (e) {
    console.log(\`Case \${idx + 1}: ERROR | \${e}\`);
  }
});
`;
    return harness;
  }
  
  // --- JAVA ---
  if (lang === 'java') {
    let importLine = '';
    if (Object.values(inputTypes).some(t => /\bList\b/.test(t))) {
      importLine = 'import java.util.*;';
    }
    
    let harness = `\n${importLine}\n// === Test Harness ===\n`;
    harness += `    public static void runTests() {\n`;
    
    testCases.forEach((tc, idx) => {
      const inputs = parseTestCaseInputs(tc.input, argNames);
      
      const formatted = inputs.map((inputValue, i) => {
        const argType = inputTypes[argNames[i]];
        const parsedValue = parseInputValue(inputValue, argType);
        return formatArg(parsedValue, argType, lang);
      });
      
      const expected = parseInputValue(tc.expectedOutput, returnType);
      
      harness += `
        try {
            `;
            
      // Determine the correct return type for Java
      let javaReturnType = returnType;
      if (returnType === 'bool') javaReturnType = 'boolean';
      if (returnType === 'int') javaReturnType = 'int';
      if (returnType.includes('[]')) javaReturnType = returnType;
      
      harness += `${javaReturnType} result = ${funcName}(${formatted.join(', ')});
            boolean passed = `;
      
      // Handle comparison based on return type
      if (returnType === 'bool' || returnType === 'boolean') {
        harness += `result == ${expected}`;
      } else if (returnType === 'int' || returnType === 'number') {
        harness += `result == ${expected}`;
      } else if (returnType.includes('[]')) {
        harness += `java.util.Arrays.equals(result, ${formatArg(parseInputValue(tc.expectedOutput, returnType), returnType, lang)})`;
      } else {
        harness += `result.equals("${expected}")`;
      }
      
      harness += `; 
            System.out.println("Case ${idx+1}: " + (passed ? "PASS" : "FAIL") + " | Expected: ${tc.expectedOutput} | Output: " + result);
        } catch (Exception e) {
            System.err.println("Case ${idx+1}: ERROR | " + e.getMessage());
        }
    `;
    });
    
    harness += `    }\n`;
    harness += `
    public static void main(String[] args) {
        runTests();
    }`;
    
    return harness;
  }

  // --- C++ ---
  if (lang === 'cpp') {
    let harness = `\n// === Test Harness ===\n`;
    
    harness += `void runTests() {\n`;
    testCases.forEach((tc, idx) => {
      const inputs = parseTestCaseInputs(tc.input, argNames);
      
      // Generate unique variable names for each test case
      let decls = '';
      let argsList = [];
      
      inputs.forEach((v, i) => {
        const argType = inputTypes[argNames[i]];
        const parsedValue = parseInputValue(v, argType);
        
        if (/\bvector\b|\[\]/.test(argType)) {
          const elemType = /int|number/.test(argType) ? 'int' : 'string';
          const varName = `${argNames[i]}_${idx}`;
          decls += `    vector<${elemType}> ${varName} = ${formatArg(parsedValue, argType, lang)};\n`;
          argsList.push(varName);
        } else {
          argsList.push(formatArg(parsedValue, argType, lang));
        }
      });
      
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType), returnType, lang);
      
      harness += `
    ${decls}
    try {
        auto result = ${funcName}(${argsList.join(', ')});
        cout << "Case ${idx+1}: " << (result == ${expected} ? "PASS" : "FAIL")
             << " | Expected: ${tc.expectedOutput} | Output: " << result << endl;
    } catch (const exception& e) {
        cerr << "Case ${idx+1}: ERROR | " << e.what() << endl;
    }
`;
    });
    harness += `}\n\n`;
    
    harness += `int main() {
    runTests();
    return 0;
}\n`;
    
    return harness;
  }

  return '';
}

async function runCode() {
  const code = editor.getValue();
  const lang = document.getElementById('languageSelect').value;

  document.getElementById('status').innerText = 'Running all test cases...';
  document.getElementById('output').innerHTML = '<pre class="info">Sending request to Piston API...</pre>';

  try {
    if (!currentQuestion) throw new Error("No question selected.");

    const testCases = currentQuestion.testCases || [];
    const inputTypes = currentQuestion.inputs?.[lang] || {};
    const funcName = currentQuestion.functionName;
    const returnType = currentQuestion.output || '';

    let fullCode;
    
    if (lang === 'java') {
      let imports = 'import java.util.*;\n';
      imports += 'import java.math.*;\n';   
      
      fullCode = `${imports}
public class Solution {
    ${code}
${generateTestHarness(lang, funcName, testCases, inputTypes, returnType)}
}`;
    } else if (lang === 'cpp') {
      fullCode = `#include <iostream>
#include <vector>
#include <string>
#include <stack>
#include <queue>
#include <map>
#include <set>
#include <unordered_map>
#include <unordered_set>
#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
using namespace std;

${code}
${generateTestHarness(lang, funcName, testCases, inputTypes, returnType)}`;
    } else {
      fullCode = code + generateTestHarness(lang, funcName, testCases, inputTypes, returnType);
    }

    const pistonURL = "https://emkc.org/api/v2/piston/execute";
    const fileExtensions = {
      "javascript": "js",
      "python": "py",
      "java": "java",
      "cpp": "cpp"
    };
    
    const fileName = lang === 'java'
      ? 'Solution.java'
      : `main.${fileExtensions[lang]}`;

    const requestData = {
      language: lang,
      version: {
        "javascript": "18.15.0",
        "python": "3.10.0",
        "java": "15.0.2",
        "cpp": "10.2.0"
      }[lang] || "*",
      files: [{
        name: fileName,
        content: fullCode
      }],
      stdin: "",
      args: [],
      compile_timeout: 10000,
      run_timeout: 3000
    };

    const response = await fetch(pistonURL, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(requestData)
    });

    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
    const result = await response.json();
    const stdoutLines = result.run.stdout?.split('\n').filter(l => l) || [];
    const stderrText  = result.run.stderr?.trim();

    // Process results
    let statusHTML = '';
    let outputHTML = '';
    let passed = 0;
    const outputLines = result.run?.stdout?.split('\n').filter(l => l) || [];
    
    outputLines.forEach(line => {
      const match = line.match(/Case (\d+): (PASS|FAIL|ERROR) \| (.*)/);
      if (match) {
        const [_, caseNum, result, details] = match;
        outputHTML += `<div class="${result.toLowerCase()}">`;
        outputHTML += `🔄 <strong>Test Case ${caseNum}:</strong> `;
        outputHTML += `${result === 'PASS' ? '✅' : result === 'FAIL' ? '❌' : '⚠️'} `;
        outputHTML += `${details}</div>`;
        if (result === 'PASS') passed++;
      }
    });
    
    if (stderrText) {
      outputHTML += `<pre class="error">⚠️ Error output:\n${stderrText}</pre>`;
    }

    const allPassed = passed === testCases.length;

    document.getElementById('output').innerHTML = outputHTML || "<pre>No output</pre>";

    won = allPassed;

    socket.emit('testCaseUpdate', {
        passed: passed,
        total: testCases.length
    });

  } catch (error) {
    document.getElementById('status').innerHTML = 
      `<div class="error">❌ Error: ${error.message}</div>`;
    document.getElementById('output').innerHTML = 
      `<pre class="error">${error.stack || error}</pre>`;
    console.error('Execution error:', error);
  }
}

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
  const rawSignature = currentQuestion.functionSignatures?.[lang] || '';
  const funcName = currentQuestion.functionName || 'functionName';
  const inputs = currentQuestion.inputs?.[lang] || {};
  const returnType = currentQuestion.output || '';
  const rawReturn = currentQuestion.output || '';
  let returnTypeForJava = rawReturn;
  if (lang === 'java' && (rawReturn === 'bool' || rawReturn === 'boolean')) {
    returnTypeForJava = 'boolean';
  }
  let fullTemplate = '';

  if (rawSignature) {
    switch (lang) {
      case 'python':
        fullTemplate = `${rawSignature}\n    # solution here\n    pass`;
        break;
      case 'javascript':
        fullTemplate = `${rawSignature} {\n  // solution here\n}`;
        break;
      case 'java':
        fullTemplate = `${rawSignature} {\n    // solution here\n}`;
        break;
      case 'cpp':
        fullTemplate = `${rawSignature} {\n    // solution here\n}`;
        break;
      default:
        fullTemplate = `// Missing signature`;
    }
  } else {
    let params = Object.entries(inputs).map(([name, type]) => {
      if (lang === 'python' || lang === 'javascript') return name;
      if (lang === 'java' || lang === 'cpp') return `${type} ${name}`;
      return name;
    }).join(', ');

    switch (lang) {
      case 'python':
        fullTemplate = `def ${funcName}(${params}):\n    # solution here\n    pass`;
        break;
      case 'javascript':
        fullTemplate = `function ${funcName}(${params}) {\n  // solution here\n}`;
        break;
      case 'java':
        fullTemplate = `public static ${returnTypeForJava} ${funcName}(${params}) {\n    // solution here\n}`;
        break;
      case 'cpp':
        fullTemplate = `${returnType} ${funcName}(${params}) {\n    // solution here\n}`;
        break;
      default:
        fullTemplate = `// Missing signature`;
    }
  }

  monaco.editor.setModelLanguage(editor.getModel(), monacoLang);
  editor.setValue(fullTemplate);
}

// Utility functions
function escapeString(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
}

function isArrayType(type) {
  return /\[\]|\bList\b|\bvector\b/.test(type);
}

document.getElementById("forfeitBtn").addEventListener("click", () => {
  console.log("Forfeit button clicked"); 
  socket.emit("forfeit");
});

socket.on('caseProgress', ({ passed, total }) => {
  updateUserCases(passed, total);
});

socket.on('opponentCaseProgress', ({ passed, total, name }) => {
  updateOpponentCases(passed, total, name);
});

function updateUserCases(passed, total) {
  userPassed = passed;
  if(userPassed > opponentPassed)
  {
    document.getElementById('userCases').classList.remove('loser');
    document.getElementById('opponentCases').classList.add('loser');
  }
  else if(userPassed == opponentPassed)
  {
    document.getElementById('userCases').classList.remove('loser');
    document.getElementById('opponentCases').classList.remove('loser');
  }

  document.getElementById('userCases').innerHTML =
    `<span id="userDisplay">${document.getElementById('userDisplay').textContent}</span>: ${passed}/${total} Testcases`;
}

function updateOpponentCases(passed, total) {
  opponentPassed = passed;  
    if(userPassed < opponentPassed)
  {
    document.getElementById('userCases').classList.add('loser');
    document.getElementById('opponentCases').classList.remove('loser');
  }
  else if(userPassed == opponentPassed)
  {
    document.getElementById('userCases').classList.remove('loser');
    document.getElementById('opponentCases').classList.remove('loser');
  }
  document.getElementById('opponentCases').innerHTML =
    `${passed}/${total} Testcases: <span id="opponentDisplay">${document.getElementById('opponentDisplay').textContent}</span>`;
}
