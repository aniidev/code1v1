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
    socket.emit('joinRoom', room);
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
  if(userData)
  {
    room = document.getElementById('roomInput').value.toUpperCase().trim();
    if (room.length !== 3) {
      alert('Room code must be 3 characters!');
      return;
    }
    socket.emit('joinRoom', room);
    document.getElementById('lobby').style.display = 'none';
  }
  else
  {
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
  alert(msg);
  document.getElementById('lobby').style.display = 'block';
  document.getElementById('game').style.display = 'none';
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
  const isPrimitive = typeof val[0] === 'number' || typeof val[0] === 'boolean';

  if (isList) {
    let elems = val.map(v => {
      if (typeof v === 'string') return `"${v}"`;
      return v;
    }).join(', ');

    if (lang === 'python' || lang === 'javascript') {
      return `[${elems}]`;
    }

    if (lang === 'java') {
      if (/\[\]$/.test(type)) {
        // For primitive arrays
        if (typeof val[0] === 'number') return `new int[]{${elems}}`;
        if (typeof val[0] === 'string') return `new String[]{${elems}}`;
        if (typeof val[0] === 'boolean') return `new boolean[]{${elems}}`;
      } else {
        // For List<T>
        const generic = typeof val[0] === 'number' ? 'Integer' : typeof val[0] === 'boolean' ? 'Boolean' : 'String';
        return `Arrays.asList(${elems})`;
      }
    }
 if (lang === 'cpp') {
      const T = typeof val[0] === 'number' ? 'int' :
                typeof val[0] === 'boolean' ? 'bool' : 'string';
      return `std::vector<${T}> vec${index} = {${elems}};`;
    }
}


  // Single values
  if (typeof val === 'string') return `"${val.replace(/"/g, '\\"')}"`;
  if (typeof val === 'boolean') return lang === 'python' ? (val ? 'True' : 'False') : (val ? 'true' : 'false');
  return val;
}

function parseInputValue(value, type) {
  try {
    // For arrays/lists
    if (type && (type.includes('List') || type.includes('[]') || type.includes('vector'))) {
      // Accept both JSON and Python/JavaScript-like arrays
      if (value.startsWith('[') && value.endsWith(']')) {
        return JSON.parse(value.replace(/'/g, '"'));
      }
      // Fallback: comma-separated
      return value.split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
    }
    // For booleans
    if (type && (type === 'bool' || type === 'boolean')) {
      if (typeof value === 'boolean') return value;
      return value.trim().toLowerCase() === 'true';
    }
    // For numbers
    if (type && (type === 'int' || type === 'number')) {
      return Number(value);
    }
    // For strings
    return value.replace(/^['"]|['"]$/g, '');
  } catch {
    return value;
  }
}

function generateTestHarness(lang, funcName, testCases, inputTypes, returnType) {
  const argNames = Object.keys(inputTypes);

  function parseInputs(tcInput) {
    const lines = tcInput.split('\n').map(l => l.trim()).filter(Boolean);
    // If only one argument, treat the whole input as one value
    if (argNames.length === 1) return [lines.join('\n')];
    // If multiple, treat each line as a separate argument
    return lines;
  }

  // --- PYTHON ---
  if (lang === 'python') {
    let harness = '\n# === Test Harness ===\n';
    harness += 'test_cases = [\n';
    testCases.forEach(tc => {
      const inputs = parseInputs(tc.input);
      const formattedInputs = inputs.map((v, i) => formatArg(parseInputValue(v, inputTypes[argNames[i]]), inputTypes[argNames[i]], lang));
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType), returnType, lang);
      // Always wrap inputs as tuple for unpacking
      harness += `    ((${formattedInputs.join(', ')}), ${expected}),\n`;
    });
    harness += ']\n';
    harness += `for idx, (inputs, expected) in enumerate(test_cases, 1):\n`;
    harness += `    try:\n`;
    harness += `        result = ${funcName}(*inputs) if isinstance(inputs, tuple) else ${funcName}(inputs)\n`;
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
      const inputs = parseInputs(tc.input);
      const formattedInputs = inputs.map((v, i) => formatArg(parseInputValue(v, inputTypes[argNames[i]]), inputTypes[argNames[i]], lang));
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType), returnType, lang);
      // Always wrap inputs as array
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
    // Fix: Ensure the Java harness contains the complete class structure
    let importLine = '';
    if (Object.values(inputTypes).some(t => /\bList\b/.test(t))) {
      importLine = 'import java.util.*;';
    }
    
    // Start with import and class definition
    let harness = `\n${importLine}\n// === Test Harness ===\n`;
    
    // Add test cases as class methods
    harness += `    public static void runTests() {\n`;
    testCases.forEach((tc, idx) => {
      const inputs = parseInputs(tc.input);
      const formatted = inputs.map((v, i) =>
        formatArg(parseInputValue(v, inputTypes[argNames[i]]),
                 inputTypes[argNames[i]], lang));
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType),
                                returnType, lang);
      
      harness += `
        try {
            Object result = ${funcName}(${formatted.join(', ')});
            boolean passed = `;
      
      // Handle comparison based on return type
      if (returnType === 'bool' || returnType === 'boolean') {
        harness += `result.equals(${expected})`;
      } else if (returnType === 'int' || returnType === 'number') {
        harness += `result.equals(${expected})`;
      } else if (returnType.includes('List') || returnType.includes('[]')) {
        harness += `result.toString().equals(${expected}.toString())`;
      } else {
        harness += `result.equals(${expected})`;
      }
      
      harness += `; 
            System.out.println("Case ${idx+1}: " + (passed ? "PASS" : "FAIL") + " | Expected: ${tc.expectedOutput} | Output: " + result);
        } catch (Exception e) {
            System.err.println("Case ${idx+1}: ERROR | " + e.getMessage());
        }
    `;
    });
    harness += `    }\n`;
    
    // Add main method
    harness += `
    public static void main(String[] args) {
        runTests();
    }`;
    
    return harness;
  }

  // --- C++ ---
  if (lang === 'cpp') {
    let harness = `\n// === Test Harness ===\n`;
    
    // Add function to run all tests
    harness += `void runTests() {\n`;
    testCases.forEach((tc, idx) => {
      const inputs = parseInputs(tc.input);
      const formatted = inputs.map((v, i) =>
        formatArg(parseInputValue(v, inputTypes[argNames[i]]),
                  inputTypes[argNames[i]], lang));
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType),
                                returnType, lang);
      
      // Handle vector arguments declarations
      let decls = '';
      inputs.forEach((v, i) => {
        const t = inputTypes[argNames[i]];
        if (/\bvector\b|\[\]/.test(t)) {
          const elemType = typeof parseInputValue(v, t)[0] === 'number' ? 'int' : 'string';
          decls += `    vector<${elemType}> ${argNames[i]} = ${formatted[i]};\n`;
        }
      });
      
      const argsList = inputs.map((_, i) =>
        /\bvector\b|\[\]/.test(inputTypes[argNames[i]]) ? argNames[i] : formatted[i]
      ).join(', ');
      
      harness += `
    ${decls}
    try {
        auto result = ${funcName}(${argsList});
        cout << "Case ${idx+1}: " << (result == ${expected} ? "PASS" : "FAIL")
             << " | Expected: ${tc.expectedOutput} | Output: " << result << endl;
    } catch (const exception& e) {
        cerr << "Case ${idx+1}: ERROR | " << e.what() << endl;
    }
`;
    });
    harness += `}\n\n`;
    
    // Add main function
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

    // Final status summary
    const allPassed = passed === testCases.length;
    statusHTML = `<div class="summary ${allPassed ? 'passed' : 'failed'}">` +
                 `Passed ${passed}/${testCases.length} test cases` +
                 `${allPassed ? ' 🎉' : ''}</div>` + statusHTML;

    document.getElementById('status').innerHTML = statusHTML;
    document.getElementById('output').innerHTML = outputHTML || "<pre>No output</pre>";

    won = allPassed;

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