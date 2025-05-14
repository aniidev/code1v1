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
  runCode();
  socket.emit('submitCode', { room, code, won});
  document.getElementById('status').innerText = 'Submitted...';
}


socket.on('result', (msg) => {
   document.getElementById('game').style.display = 'none';
  document.getElementById('endScreen').style.display = 'block';
  document.getElementById('end-status').innerText = msg;
  if(won)
    {
      document.getElementById('score').innerHTML = 820; //make elo system later
      document.getElementById('elo-change').style.color = 'green';
      document.getElementById('elo-change').innerHTML = 20;
    } 
    else
    {
       document.getElementById('score').innerHTML = 780; //make elo system later
       document.getElementById('elo-change').style.color = 'red';
      document.getElementById('elo-change').innerHTML = -20;
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

function findPublicMatch() {
  socket.emit('publicMatch');
  document.getElementById('lobby').style.display = 'none';
  document.getElementById('waitingScreen').style.display = 'block';
}

socket.on('waitingForOpponent', () => {
  document.getElementById('waitingScreen').innerText = 'Finding an opponent...';
});

function returnLobby()
{
    document.getElementById('lobby').style.display = 'block';
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
  if (Array.isArray(val) || /\[\]|\bList\b|\bvector\b/.test(type)) {
    if (lang === 'python' || lang === 'javascript') {
      return `[${val.map(v => typeof v === 'string' ? `"${v}"` : v).join(', ')}]`;
    }
    if (lang === 'java') {
      return `Arrays.asList(${val.map(v => `"${v}"`).join(', ')})`;
    }
    if (lang === 'cpp') {
      return `{${val.map(v => `"${v}"`).join(', ')}}`;
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
    if (Object.values(inputTypes).some(type => /\bList\b/.test(type))) {
      importLine = 'import java.util.*;';
    }
    let harness = `\n${importLine}\npublic class Solution {\n    // user code above\n    public static void main(String[] args) {\n`;
    testCases.forEach((tc, idx) => {
      const inputs = parseInputs(tc.input);
      const formattedInputs = inputs.map((v, i) => formatArg(parseInputValue(v, inputTypes[argNames[i]]), inputTypes[argNames[i]], lang));
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType), returnType, lang);
      harness += `        try {\n`;
      harness += `            Object result = new Solution().${funcName}(${formattedInputs.join(', ')});\n`;
      harness += `            System.out.println("Case ${idx + 1}: " + (result.equals(${expected}) ? "PASS" : "FAIL") + " | Expected: ${tc.expectedOutput} | Output: " + result);\n`;
      harness += `        } catch (Exception e) {\n`;
      harness += `            System.out.println("Case ${idx + 1}: ERROR | " + e);\n`;
      harness += `        }\n`;
    });
    harness += '    }\n}\n';
    return harness;
  }

  // --- C++ ---
  if (lang === 'cpp') {
    let harness = `\n#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n// user code above\nint main() {\n`;
    testCases.forEach((tc, idx) => {
      const inputs = parseInputs(tc.input);
      const formattedInputs = inputs.map((v, i) => formatArg(parseInputValue(v, inputTypes[argNames[i]]), inputTypes[argNames[i]], lang));
      const expected = formatArg(parseInputValue(tc.expectedOutput, returnType), returnType, lang);
      harness += `    try {\n`;
      harness += `        auto result = ${funcName}(${formattedInputs.join(', ')});\n`;
      harness += `        cout << "Case ${idx + 1}: " << (result == ${expected} ? "PASS" : "FAIL") << " | Expected: ${tc.expectedOutput} | Output: " << result << endl;\n`;
      harness += `    } catch (const exception& e) {\n`;
      harness += `        cout << "Case ${idx + 1}: ERROR | " << e.what() << endl;\n`;
      harness += `    }\n`;
    });
    harness += `    return 0;\n}\n`;
    return harness;
  }

  // --- JavaScript already works, so just return empty string ---
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

    const requestData = {
      language: lang,
      version: {
        "javascript": "18.15.0",
        "python": "3.10.0",
        "java": "15.0.2",
        "cpp": "10.2.0"
      }[lang] || "*",
      files: [{
        name: `main.${fileExtensions[lang] || lang}`,
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
        fullTemplate = `public ${returnType} ${funcName}(${params}) {\n    // solution here\n}`;
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

// Wraps Java code in a Solution class if not already wrapped
function wrapJavaMethod(methodCode, funcName, args, inputTypes, returnType) {
  const argList = Object.entries(inputTypes).map(
    ([name, type], idx) => formatArg(args[idx], type, 'java')
  ).join(', ');
  let printStatement = `System.out.println(new Solution().${funcName}(${argList}));`;
  let importLine = '';
  if (Object.values(inputTypes).some(type => /\bList\b/.test(type))) {
    importLine = 'import java.util.*;';
  }
  return `
${importLine}
public class Solution {
${methodCode}

public static void main(String[] args) {
    ${printStatement}
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

