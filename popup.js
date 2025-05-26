
//const config vars
const STUDY_MINUTES = 25; //study period -> standard Pomodoro period
const BREAK_MINUTES = 5; //break period
const LOG_INTERVAL_MS = 300_000; //screenshot logging interval -> set to 5 min in milliseconds

//initialized vars
let countdownTimer = null;
let captureInterval = null;
let startTimestamp = null;

//all of our button listeners
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status"); // Fixed: was 'status', now matches usage
const exportBtn = document.getElementById("exportBtn");
const countdown = document.getElementById("countdown");

function secondsToMMSS(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function updateCountdown(secLeft) {
  countdown.textContent = secondsToMMSS(secLeft);
}

//store log entry in chrome.local.storage
function saveLog(entry) {
  chrome.storage.local.get({ logs: [] }, (data) => {
    data.logs.push(entry);
    chrome.storage.local.set({ logs: data.logs });
  });
}

//screenshot logging logic
async function captureAndLog() {
  try {
    //pull active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Skip certain URLs that can't be captured
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('moz-extension://') ||
        tab.url.startsWith('file://')) {
      console.log('Skipping screenshot for protected URL:', tab.url);
      
      // Still log the tab visit without screenshot
      const entry = {
        time: new Date().toISOString(),
        title: tab.title,
        url: tab.url,
        screenshot: null // No screenshot for protected pages
      };
      saveLog(entry);
      return;
    }

    //capture screenshots 
    const screenshot = await chrome.tabs.captureVisibleTab();

    //logs entry
    const entry = {
      time: new Date().toISOString(),
      title: tab.title,
      url: tab.url,
      screenshot
    };

    //keeps logs
    saveLog(entry);
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    
    // Still try to log tab info without screenshot
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const entry = {
          time: new Date().toISOString(),
          title: tab.title,
          url: tab.url,
          screenshot: null
        };
        saveLog(entry);
      }
    } catch (tabError) {
      console.error('Error getting tab info:', tabError);
    }
  }
}

//timer div logic
function startSession() {
  startBtn.disabled = true;
  stopBtn.disabled = false;
  statusEl.textContent = "Studying…";
  startTimestamp = Date.now();

  //ui for timer
  let secondsLeft = STUDY_MINUTES * 60;
  updateCountdown(secondsLeft);

  countdownTimer = setInterval(() => {
    secondsLeft--;
    updateCountdown(secondsLeft);

    if (secondsLeft <= 0) endSession();
  }, 1_000);

  //screenshot at intervals
  captureAndLog(); // immediate first log
  captureInterval = setInterval(captureAndLog, LOG_INTERVAL_MS);
}

function endSession() {
  clearInterval(countdownTimer);
  clearInterval(captureInterval);

  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = "Session ended.";

  //captures final log
  captureAndLog();
}

//export report of studying btn logic
function buildHtmlReport(logs) {
  const totalMinutes = startTimestamp ? Math.round((Date.now() - startTimestamp) / 60_000) : 0;

  let html = `
    <!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Study Report</title>
    <style>
      body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.4}
      img{max-width:100%;border:1px solid #ccc;margin-top:0.5rem}
      .entry{margin-bottom:1.5rem;padding:1rem;border:1px solid #eee}
      .no-screenshot{color:#666;font-style:italic}
    </style>
    </head><body>
    <h1>Study Report</h1>
    <p><strong>Total time:</strong> ${totalMinutes} min</p>
    <p><strong>Log entries:</strong> ${logs.length}</p><hr>
  `;

  logs.forEach((e, idx) => {
    html += `
      <div class="entry">
        <h2>Entry ${idx + 1}</h2>
        <p><strong>Time:</strong> ${new Date(e.time).toLocaleString()}</p>
        <p><strong>Title:</strong> ${e.title || 'Unknown'}</p>
        <p><strong>URL:</strong> <a href="${e.url}" target="_blank">${e.url}</a></p>
        ${e.screenshot ? 
          `<img src="${e.screenshot}" alt="Screenshot">` : 
          `<p class="no-screenshot">No screenshot available (protected page)</p>`
        }
      </div>
    `;
  });

  html += "</body></html>";
  return html;
}

function exportReport() {
  chrome.storage.local.get({ logs: [] }, (data) => {
    if (data.logs.length === 0) {
      alert('No study sessions recorded yet!');
      return;
    }
    
    const html = buildHtmlReport(data.logs);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `study-report-${new Date().toISOString().split('T')[0]}.html`;
    a.click();

    URL.revokeObjectURL(url);
  });
}

// Clear old logs function (optional - you might want to add a button for this)
function clearLogs() {
  chrome.storage.local.set({ logs: [] }, () => {
    alert('Study logs cleared!');
  });
}

//event listeners
startBtn.addEventListener("click", startSession);
stopBtn.addEventListener("click", endSession);
exportBtn.addEventListener("click", exportReport);

// Initialize UI state
document.addEventListener('DOMContentLoaded', () => {
  statusEl.textContent = "Ready to study?";
});