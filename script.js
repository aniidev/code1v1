const socket = io();
let room = '';
let vsInterval = null;
let editor = null;
let currentQuestion = null;
let gameTimerInterval = null;
let won = false;
const userData = JSON.parse(localStorage.getItem("userData"));

if (userData) {
  document.getElementById("welcomeText").textContent =
    `Welcome, ${userData.username}! ELO: ${userData.elo}`;

}


socket.on('playerInfo', ({ self, opponent, selfElo, opponentElo }) => {
  document.getElementById("user").textContent = self;
  document.getElementById("opponent").textContent = opponent;
  document.getElementById("userElo").textContent = `rating: ${selfElo}`;
  document.getElementById("opponentElo").textContent = `rating: ${opponentElo}`;
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
  document.getElementById('publicWaiting').style.display = 'none';
  document.getElementById('header').style.display = 'none';
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
  socket.emit('publicMatch');
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('publicWaiting').style.display = 'block';
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
  // detect element type for vectors/lists
  if (isList) {
    let elems = val.map(v => {
      if (typeof v === 'string') return `"${v}"`;
      return v; // number or boolean literal
    }).join(', ');
    if (lang === 'python' || lang === 'javascript') {
      return `[${elems}]`;
    }
    if (lang === 'java') {
      // infer generic type
      const generic = typeof val[0] === 'number' ? 'Integer' : 'String';
      return `Arrays.asList(${elems})`;
    }
    if (lang === 'cpp') {
      // infer <T>
      const T = typeof val[0] === 'number' ? 'int' : 'string';
      return `{${elems}}`;  // vector<T> init-list
    }
  }
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
  let importLine = '';
  if (Object.values(inputTypes).some(t => /\bList\b/.test(t))) {
    importLine = 'import java.util.*;';
  }
  let harness = `
${importLine}
public class Solution {
    // user code above
    public static void main(String[] args) {
  `;
  testCases.forEach((tc, idx) => {
    const inputs = parseInputs(tc.input);
    const formatted = inputs.map((v,i) =>
      formatArg(parseInputValue(v, inputTypes[argNames[i]]),
                inputTypes[argNames[i]], lang));
    const expected = formatArg(parseInputValue(tc.expectedOutput, returnType),
                               returnType, lang);
    harness += `
        try {
            Object result = new Solution().${funcName}(${formatted.join(', ')});
            if (result.equals(${expected})) {
                System.out.println("Case ${idx+1}: PASS | Expected: ${tc.expectedOutput} | Output: " + result);
            } else {
                System.out.println("Case ${idx+1}: FAIL | Expected: ${tc.expectedOutput} | Output: " + result);
            }
        } catch (Exception e) {
            System.err.println("Case ${idx+1}: ERROR | " + e.getMessage());
        }
    `;
  });
  harness += `
    }
}
`;
  return harness;
}

  // --- C++ ---
  if (lang === 'cpp') {
  let harness = `
#include <iostream>
#include <vector>
#include <string>
using namespace std;
// user code above
int main() {
`;
  testCases.forEach((tc, idx) => {
    const inputs = parseInputs(tc.input);
    const formatted = inputs.map((v,i) =>
      formatArg(parseInputValue(v, inputTypes[argNames[i]]),
                inputTypes[argNames[i]], lang));
    const expected = formatArg(parseInputValue(tc.expectedOutput, returnType),
                               returnType, lang);
    // declare each vector arg if needed
    let decls = '';
    inputs.forEach((v,i) => {
      const t = inputTypes[argNames[i]];
      if (/\bvector\b|\[\]/.test(t)) {
        const elemType = typeof parseInputValue(v, t)[0] === 'number' ? 'int' : 'string';
        decls += `    vector<${elemType}> ${argNames[i]} = ${formatted[i]};\n`;
      }
    });
    const argsList = inputs.map((_,i) =>
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
  harness += `
    return 0;
}
`;
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

    // Generate code with test harness
    let fullCode = code + generateTestHarness(lang, funcName, testCases, inputTypes, returnType);

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
    if (stderrText) {
      outputHTML += `<pre class="error">⚠️ Error output:\n${stderrText}</pre>`;
    }
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


function wrapJavaMethod(methodCode, funcName, args, inputTypes, returnType) {
  // only import java.util if we need Lists
  const importLine = Object.values(inputTypes).some(t => /\bList\b/.test(t))
    ? 'import java.util.*;'
    : '';

  // build the argument list for the call in main()
  const argNames = Object.keys(inputTypes);
  const argList = args.map((val, i) =>
    formatArg(val, inputTypes[argNames[i]], 'java')
  ).join(', ');

  // decide whether to call statically or via instance
  const callExpr = methodCode.includes(' static ')
    ? `Solution.${funcName}(${argList})`
    : `new Solution().${funcName}(${argList})`;

  return `
${importLine}
public class Solution {
${methodCode}

  public static void main(String[] args) {
    try {
      Object result = ${callExpr};
      System.out.println(result);
    } catch (Exception e) {
      System.err.println("ERROR: " + e.getMessage());
    }
  }
}
`.trim();
}

// Generates the invocation code for each language
function generateInvocationCode(lang, funcName, args, returnType) {
  if (lang === 'python') {
    return `print(${funcName}(${args.join(', ')}))`;
  } else if (lang === 'javascript') {
    return `console.log(${funcName}(${args.join(', ')}));`;
  } else if (lang === 'java') {
    // For Java, we need a main method to run the function
    const argsList = args.map((a, i) => {
      // For arrays, convert JSON to array
      if (Array.isArray(a)) {
        return `new int[]{${a.join(',')}}`;
      }
      if (typeof a === 'string') return `"${a}"`;
      return a;
    }).join(', ');
    return `
public static void main(String[] args) {
  Solution sol = new Solution();
  System.out.println(java.util.Arrays.toString(sol.${funcName}(${argsList})));
}
`;
  } else if (lang === 'cpp') {
    // For C++, assumes function is in global scope
    return `
int main() {
  auto result = ${funcName}(${args.join(', ')});
  // Print logic depends on return type
  return 0;
}
`;
  }
  return '';
}

// Utility: Escape string for code (handles quotes and backslashes)
function escapeString(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'");
}

// Utility: Detect if type is array/list
function isArrayType(type) {
  return /\[\]|\bList\b|\bvector\b/.test(type);
}




// Wrap C++ code with main for invocation
function wrapCppMethod(methodCode, funcName, args, inputTypes, returnType) {
  const argList = Object.entries(inputTypes).map(
    ([name, type], idx) => formatArg(args[idx], type, 'cpp')
  ).join(', ');
  let printStatement = '';
  if (Object.values(inputTypes).some(type => /\bvector\b/.test(type))) {
    // If the function expects a vector, we must declare it first
    let vectorName = 'wordList';
    let vectorInit = `vector<string> ${vectorName} = ${argList};`;
    printStatement = `${vectorInit}\n    cout << ${funcName}("hit", "cog", ${vectorName}) << endl;`;
  } else {
    printStatement = `cout << ${funcName}(${argList}) << endl;`;
  }
  return `
#include <iostream>
#include <vector>
#include <string>
using namespace std;

${methodCode}

int main() {
    ${printStatement}
    return 0;
}
`.trim();
}

