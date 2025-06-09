//UI elements
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const exportBtn = document.getElementById("exportBtn");
const countdown = document.getElementById("countdown");

const progressCircle = document.getElementById('progressCircle');

// Update interval for UI

let CIRCUMFERENCE = 0;
if (progressCircle) {
    const radius = progressCircle.r.baseVal.value;
    CIRCUMFERENCE = 2 * Math.PI * radius;
    progressCircle.style.strokeDasharray = CIRCUMFERENCE;
    updateProgress(0);
}

function secondsToMMSS(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
}

//Alarm sound playing function
function playAlarmSound() {
    const audio = new Audio(chrome.runtime.getURL("sounds\notification.wav"));
    audio.play();
}

function updateProgress(percent) {
    if (!progressCircle) return;
    // Clamp percent between 0 and 1
    const clampedPercent = Math.min(Math.max(percent, 0), 1);
    // Calculate offset (starts full and decreases as progress increases)
    const offset = CIRCUMFERENCE * (1 - clampedPercent);
    progressCircle.style.strokeDashoffset = offset;
}

function updateUI(timerState) {
    if (timerState.isRunning) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusEl.textContent = "Studying…";
        countdown.textContent = secondsToMMSS(timerState.secondsLeft);

        // Calculate progress as elapsed/total
        const progressPercent = timerState.totalSeconds > 0 ? 
            timerState.elapsedSeconds / timerState.totalSeconds : 0;
        
        updateProgress(progressPercent);
        
        console.log(`Progress: ${timerState.elapsedSeconds}/${timerState.totalSeconds} = ${progressPercent.toFixed(2)}`);
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusEl.textContent = timerState.startTime ? "Session ended." : "Ready to study?";
        countdown.textContent = timerState.startTime ? "00:00" : "";
        
        // Reset progress ring
        updateProgress(timerState.startTime ? 1 : 0); // Full if session just ended, empty if ready to start
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'playAlarmSound') {
        const audio = new Audio(chrome.runtime.getURL("sounds/alarm.mp3"));
        audio.play();
    }
});


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
            img{max-width:50%;border:1px solid #ccc;margin-top:0.5rem}
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