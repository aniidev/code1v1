const socket = io();
let room = '';
let vsInterval = null;
let editor = null;
let currentQuestion = null;
let gameTimerInterval = null;

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

function generateTestHarness(lang, funcName, testCases, inputTypes, returnType) {
  // Helper to format arguments for code
  function formatArg(val, type) {
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
    if (/str|String|string/.test(type)) {
      return `"${val}"`;
    }
    if (/bool|boolean/.test(type)) {
      return val ? (lang === 'python' ? 'True' : 'true') : (lang === 'python' ? 'False' : 'false');
    }
    return val;
  }

  // Build test cases as code
  let harness = '';

  if (lang === 'python') {
    harness += '\n# --- Test harness ---\n';
    harness += 'test_cases = [\n';
    for (const tc of testCases) {
      const argNames = Object.keys(inputTypes);
      const inputVals = tc.input.trim().split('\n').map((v, i) => {
        const type = inputTypes[argNames[i]];
        // Parse arrays/lists
        if (type && (type.includes('List') || type.includes('[]'))) {
          try {
            return JSON.parse(v.replace(/'/g, '"'));
          } catch {
            return v;
          }
        }
        if (type && (type === 'int' || type === 'number')) return Number(v);
        if (type && (type === 'bool' || type === 'boolean')) return v.trim().toLowerCase() === 'true';
        return v.replace(/^['"]|['"]$/g, "");
      });
      harness += `    ((${inputVals.map((v, i) => formatArg(v, inputTypes[argNames[i]])).join(', ')}), ${formatArg(tc.expectedOutput, returnType)}),\n`;
    }
    harness += ']\n';
    harness += 'for i, (inputs, expected) in enumerate(test_cases, 1):\n';
    harness += '    try:\n';
    harness += `        result = ${funcName}(*inputs)\n`;
    harness += '        print(f"Case {i}: {"PASS" if result == expected else "FAIL"} | Expected: {expected} | Output: {result}")\n';
    harness += '    except Exception as e:\n';
    harness += '        print(f"Case {i}: EXCEPTION | {e}")\n';
    return harness;
  }

  if (lang === 'javascript') {
    harness += '\n// --- Test harness ---\n';
    harness += 'const testCases = [\n';
    for (const tc of testCases) {
      const argNames = Object.keys(inputTypes);
      const inputVals = tc.input.trim().split('\n').map((v, i) => {
        const type = inputTypes[argNames[i]];
        if (type && (type.includes('[]'))) {
          try {
            return JSON.parse(v.replace(/'/g, '"'));
          } catch {
            return v;
          }
        }
        if (type && (type === 'int' || type === 'number')) return Number(v);
        if (type && (type === 'bool' || type === 'boolean')) return v.trim().toLowerCase() === 'true';
        return v.replace(/^['"]|['"]$/g, "");
      });
      harness += `  [[${inputVals.map((v, i) => formatArg(v, inputTypes[argNames[i]])).join(', ')}], ${formatArg(tc.expectedOutput, returnType)}],\n`;
    }
    harness += '];\n';
    harness += 'testCases.forEach(([inputs, expected], i) => {\n';
    harness += `  try {\n    const result = ${funcName}(...inputs);\n`;
    harness += `    console.log(\`Case \${i+1}: \${result === expected ? 'PASS' : 'FAIL'} | Expected: \${expected} | Output: \${result}\`);\n`;
    harness += '  } catch (e) {\n    console.log(`Case ${i+1}: EXCEPTION | ${e}`);\n  }\n});\n';
    return harness;
  }

  if (lang === 'java') {
    let importLine = '';
    if (Object.values(inputTypes).some(type => /\bList\b/.test(type))) {
      importLine = 'import java.util.*;';
    }
    harness += `\n${importLine}\npublic class Solution {\n`;
    harness += '    // user code above\n';
    harness += '    public static void main(String[] args) {\n';
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const argNames = Object.keys(inputTypes);
      const inputVals = tc.input.trim().split('\n').map((v, j) => {
        const type = inputTypes[argNames[j]];
        if (type && (type.includes('List'))) {
          try {
            return `Arrays.asList(${JSON.parse(v.replace(/'/g, '"')).map(x => `"${x}"`).join(', ')})`;
          } catch {
            return v;
          }
        }
        if (type && (type === 'int' || type === 'number')) return Number(v);
        if (type && (type === 'bool' || type === 'boolean')) return v.trim().toLowerCase() === 'true';
        return `"${v.replace(/^['"]|['"]$/g, "")}"`;
      });
      harness += `        try {\n`;
      harness += `            Object result = new Solution().${funcName}(${inputVals.join(', ')});\n`;
      harness += `            System.out.println("Case ${i+1}: " + (result.equals(${formatArg(tc.expectedOutput, returnType)}) ? "PASS" : "FAIL") + " | Expected: ${tc.expectedOutput} | Output: " + result);\n`;
      harness += `        } catch (Exception e) {\n`;
      harness += `            System.out.println("Case ${i+1}: EXCEPTION | " + e);\n`;
      harness += `        }\n`;
    }
    harness += '    }\n}\n';
    return harness;
  }

  if (lang === 'cpp') {
    harness += `\n#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n`;
    harness += `// user code above\n`;
    harness += `int main() {\n`;
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const argNames = Object.keys(inputTypes);
      const inputVals = tc.input.trim().split('\n').map((v, j) => {
        const type = inputTypes[argNames[j]];
        if (type && (type.includes('vector'))) {
          try {
            return `{${JSON.parse(v.replace(/'/g, '"')).map(x => `"${x}"`).join(', ')}}`;
          } catch {
            return v;
          }
        }
        if (type && (type === 'int' || type === 'number')) return Number(v);
        if (type && (type === 'bool' || type === 'boolean')) return v.trim().toLowerCase() === 'true';
        return `"${v.replace(/^['"]|['"]$/g, "")}"`;
      });
      let expected = tc.expectedOutput;
      harness += `    try {\n`;
      harness += `        auto result = ${funcName}(${inputVals.join(', ')});\n`;
      harness += `        cout << "Case ${i+1}: " << (result == ${expected} ? "PASS" : "FAIL") << " | Expected: ${expected} | Output: " << result << endl;\n`;
      harness += `    } catch (exception& e) {\n`;
      harness += `        cout << "Case ${i+1}: EXCEPTION | " << e.what() << endl;\n`;
      harness += `    }\n`;
    }
    harness += `    return 0;\n}\n`;
    return harness;
  }

  return '';
}


async function runCode() {
  const code = editor.getValue();
  const lang = document.getElementById('languageSelect').value;

  document.getElementById('status').innerText = 'Running...';
  document.getElementById('output').innerHTML = '<pre class="info">Sending request to Piston API...</pre>';

  try {
    if (!currentQuestion) throw new Error("No question selected.");

    const testCases = currentQuestion.testCases || [];
    const inputTypes = currentQuestion.inputs?.[lang] || {};
    const funcName = currentQuestion.functionName;
    const returnType = currentQuestion.output || '';

    let fullCode = code;

    // Append the harness for all test cases
    fullCode += generateTestHarness(lang, funcName, testCases, inputTypes, returnType);

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

    const requestData = {
      language: lang,
      version: languageVersions[lang] || "*",
      files: [
        {
          name: `main.${fileExtensions[lang] || lang}`,
          content: fullCode
        }
      ],
      stdin: "",
      args: [],
      compile_timeout: 10000,
      run_timeout: 3000
    };

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

    // Parse and display results
    let statusSummary = '';
    let outputHTML = '';
    let outputLines = (result.run && result.run.stdout ? result.run.stdout.trim().split('\n') : []);
    let passCount = 0;

    outputLines.forEach(line => {
      outputHTML += `<pre>${line}</pre>`;
      if (line.includes('PASS')) passCount++;
    });

    statusSummary = `Passed ${passCount} out of ${testCases.length} test cases.`;

    document.getElementById('status').innerText = statusSummary;
    document.getElementById('output').innerHTML = outputHTML || "<pre>(No standard output)</pre>";

  } catch (error) {
    document.getElementById('status').innerText = `Error: ${error.message}`;
    console.error('Error executing code:', error);
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


// Parses a single input string (from test case) into an array of arguments, based on the expected input types
function parseInputs(inputString, inputTypes, lang) {
  const lines = inputString.trim().split('\n');
  const argNames = Object.keys(inputTypes);
  let args = [];

  for (let i = 0; i < argNames.length; i++) {
    let value = lines[i];
    let type = inputTypes[argNames[i]];

    // Handle arrays/lists for different languages
    if (type.includes('List') || type.includes('[]') || type.includes('vector')) {
      // Remove brackets and split by comma
      value = value.replace(/[\[\]]/g, '').split(',').map(v => {
        // For string arrays, remove quotes
        if (type.includes('str') || type.includes('String')) {
          return v.replace(/['"]/g, '').trim();
        }
        return v.trim();
      });
      // For Java/C++/JS, keep as array; for Python pass as list
      if (lang === 'python') {
        value = JSON.stringify(value);
      } else if (lang === 'java' || lang === 'cpp' || lang === 'javascript') {
        value = JSON.stringify(value);
      }
    } else if (type === 'int' || type === 'number') {
      value = Number(value);
    } else if (type === 'bool' || type === 'boolean') {
      value = value.trim().toLowerCase() === 'true';
    } else if (type === 'str' || type === 'String' || type === 'string') {
      value = value.replace(/['"]/g, '').trim();
    }
    args.push(value);
  }
  return args;
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

// Parse user input string into arguments, respecting types
function parseInputs(inputString, inputTypes, lang) {
  const lines = inputString.trim().split('\n');
  const argNames = Object.keys(inputTypes);
  let args = [];

  for (let i = 0; i < argNames.length; i++) {
    let value = lines[i];
    let type = inputTypes[argNames[i]];

    if (isArrayType(type)) {
      // Remove brackets, split, and trim
      let arr = value.replace(/[\[\]]/g, '').split(',').map(v => v.trim());
      // For string arrays, remove quotes
      if (/str|String/.test(type)) arr = arr.map(v => v.replace(/^['"]|['"]$/g, ""));
      value = arr;
    } else if (/int|number/.test(type)) {
      value = Number(value.trim());
    } else if (/bool|boolean/.test(type)) {
      value = value.trim().toLowerCase() === 'true';
    } else if (/str|String|string/.test(type)) {
      value = value.replace(/^['"]|['"]$/g, "").trim();
    }
    args.push(value);
  }
  return args;
}

// Generate argument list for function call in each language
function formatArg(val, type, lang) {
  // Handle arrays/lists
  if (Array.isArray(val) || /\[\]|\bList\b|\bvector\b/.test(type)) {
    if (lang === 'python' || lang === 'javascript') {
      return `[${val.map(v => `"${v}"`).join(', ')}]`;
    }
    if (lang === 'java') {
      return `Arrays.asList(${val.map(v => `"${v}"`).join(', ')})`;
    }
    if (lang === 'cpp') {
      return `{${val.map(v => `"${v}"`).join(', ')}}`;
    }
  }
  // Handle strings
  if (/str|String|string/.test(type)) {
    return `"${val}"`;
  }
  // Handle booleans
  if (/bool|boolean/.test(type)) {
    return val ? (lang === 'python' ? 'True' : 'true') : (lang === 'python' ? 'False' : 'false');
  }
  // Numbers
  return val;
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


// Generate function call for Python and JavaScript
function generateInvocationCode(lang, funcName, parsedArgs, inputTypes, returnType) {
  const argList = Object.entries(inputTypes).map(
    ([name, type], idx) => formatArg(parsedArgs[idx], type, lang)
  ).join(', ');
  if (lang === 'python') {
    return `print(${funcName}(${argList}))`;
  }
  if (lang === 'javascript') {
    return `console.log(${funcName}(${argList}));`;
  }
  return '';
}

