//UI elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const exportBtn = document.getElementById("exportBtn");
const countdown = document.getElementById("countdown");

// Update interval for UI
let uiUpdateInterval = null;

function secondsToMMSS(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
}

function updateUI(timerState) {
    if (timerState.isRunning) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusEl.textContent = "Studying…";
        countdown.textContent = secondsToMMSS(timerState.secondsLeft);
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusEl.textContent = timerState.startTime ? "Session ended." : "Ready to study?";
        countdown.textContent = timerState.startTime ? "00:00" : "";
    }
}

function startSession() {
    chrome.runtime.sendMessage({ action: 'startTimer' }, (response) => {
        if (response.success) {
            updateUI(response.state);
            startUIUpdates();
        }
    });
}

function stopSession() {
    chrome.runtime.sendMessage({ action: 'stopTimer' }, (response) => {
        if (response.success) {
            updateUI(response.state);
            stopUIUpdates();
        }
    });
}

function startUIUpdates() {
    if (uiUpdateInterval) return; // Already running
    
    uiUpdateInterval = setInterval(() => {
        chrome.runtime.sendMessage({ action: 'getTimerState' }, (response) => {
            if (response && response.state) {
                updateUI(response.state);
                
                // Stop updates if timer is no longer running
                if (!response.state.isRunning) {
                    stopUIUpdates();
                }
            }
        });
    }, 1000);
}

function stopUIUpdates() {
    if (uiUpdateInterval) {
        clearInterval(uiUpdateInterval);
        uiUpdateInterval = null;
    }
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

function buildHtmlReport(logs) {
    // Get total time from first to last log entry
    const totalMinutes = logs.length > 1 ? 
        Math.round((new Date(logs[logs.length - 1].time) - new Date(logs[0].time)) / 60000) : 0;

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

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'timerUpdate':
            updateUI(message.state);
            break;
        case 'timerStopped':
            updateUI(message.state);
            stopUIUpdates();
            break;
    }
});

// Event listeners
startBtn.addEventListener("click", startSession);
stopBtn.addEventListener("click", stopSession);
exportBtn.addEventListener("click", exportReport);

// Initialize UI when popup opens
document.addEventListener('DOMContentLoaded', () => {
    // Get current timer state from background
    chrome.runtime.sendMessage({ action: 'getTimerState' }, (response) => {
        if (response && response.state) {
            updateUI(response.state);
            
            // Start UI updates if timer is running
            if (response.state.isRunning) {
                startUIUpdates();
            }
        } else {
            // Default state
            statusEl.textContent = "Ready to study?";
        }
    });
});

// Clean up when popup closes
window.addEventListener('beforeunload', () => {
    stopUIUpdates();
});