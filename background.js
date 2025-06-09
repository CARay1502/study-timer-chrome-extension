// Configuration
const STUDY_MINUTES = 1;
const LOG_INTERVAL_MS = 300_000; // 5 minutes

// Timer state
let timerState = {
    isRunning: false,
    startTime: null,
    endTime: null,
    countdownTimer: null,
    captureInterval: null
};

//New offscreen document manager
let offscreenDocumentCreated = false;

chrome.runtime.onInstalled.addListener(() => {
    console.log("Study Timer extension installed.");
    
    // Initialize storage
    chrome.storage.local.get({ logs: [], timerState: null }, (data) => {
        if (!data.logs) {
            chrome.storage.local.set({ logs: [] });
        }
    });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'startTimer':
            startStudySession();
            sendResponse({ success: true, state: getTimerState() });
            break;
            
        case 'stopTimer':
            stopStudySession();
            sendResponse({ success: true, state: getTimerState() });
            break;
            
        case 'getTimerState':
            sendResponse({ state: getTimerState() });
            break;
            
        default:
            sendResponse({ error: 'Unknown action' });
    }
    return true; // Keep message channel open for async response
});

function getTimerState() {
    const now = Date.now();
    let secondsLeft = 0;
    let totalSeconds = STUDY_MINUTES * 60; // Fixed: declare totalSeconds properly
    let elapsedSeconds = 0;

    if (timerState.isRunning && timerState.endTime) {
        secondsLeft = Math.max(0, Math.floor((timerState.endTime - now) / 1000));
        elapsedSeconds = totalSeconds - secondsLeft; // Calculate elapsed time
    }
    
    return {
        isRunning: timerState.isRunning,
        startTime: timerState.startTime,
        endTime: timerState.endTime,
        secondsLeft: secondsLeft,
        totalSeconds: totalSeconds, // Always return the full duration
        elapsedSeconds: elapsedSeconds, // Add elapsed seconds for easier calculation
        totalMinutes: timerState.startTime ? Math.round((now - timerState.startTime) / 60000) : 0
    };
}

// new play function for playCompletionSound() when timer is up
//create new offscreen doc for audio background
async function createOffscreenDocument() {
    if (offscreenDocumentCreated) return;

    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play notification sound when study timer completes'
        });
        offscreenDocumentCreated = true;
        console.log('Offscreen document created for audio playback');
    } catch (error) {
        console.error('Error creating offscreen document: ', error);
    }
}

//function for making sure offscreen doc exists and play sound
async function playCompletionSound() {
    try {
        await createOffscreenDocument();

        chrome.runtime.sendMessage({ action: 'playCompletionSound' });
        console.log('Completion sound triggered');
    } catch (error) {
        console.error('Error playing completion sound: ', error);
    }
}

function startStudySession() {
    if (timerState.isRunning) return;
    
    const now = Date.now();
    timerState.isRunning = true;
    timerState.startTime = now;
    timerState.endTime = now + (STUDY_MINUTES * 60 * 1000);
    
    // Set up countdown timer
    timerState.countdownTimer = setInterval(() => {
        const state = getTimerState();
        
        // Notify popup if it's open
        chrome.runtime.sendMessage({ 
            action: 'timerUpdate', 
            state: state 
        }).catch(() => {
            // Popup not open, ignore error
        });
        
        if (state.secondsLeft <= 0) {
            stopStudySession();
        }
    }, 1000);
    
    // Set up screenshot interval
    captureAndLog(); // Immediate first capture
    timerState.captureInterval = setInterval(captureAndLog, LOG_INTERVAL_MS);
    
    console.log('Study session started');
}

function stopStudySession() {
    if (!timerState.isRunning) return;
    
    // Clear intervals
    if (timerState.countdownTimer) {
        clearInterval(timerState.countdownTimer);
        timerState.countdownTimer = null;
    }
    
    if (timerState.captureInterval) {
        clearInterval(timerState.captureInterval);
        timerState.captureInterval = null;
    }
    
    // Final capture
    captureAndLog();
    
    //Play sond when timer complete
    playCompletionSound();

    // Reset timer state
    timerState.isRunning = false;
    timerState.endTime = null;
    
    // Notify popup if it's open
    chrome.runtime.sendMessage({ 
        action: 'timerStopped', 
        state: getTimerState() 
    }).catch(() => {
        // Popup not open, ignore error
    });
    
    console.log('Study session stopped');
}

async function captureAndLog() {
    try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        let screenshot = null;
        
        // Try to capture screenshot, skip for protected URLs
        if (!tab.url.startsWith('chrome://') && 
            !tab.url.startsWith('chrome-extension://') && 
            !tab.url.startsWith('moz-extension://') &&
            !tab.url.startsWith('file://')) {
            
            try {
                screenshot = await chrome.tabs.captureVisibleTab();
            } catch (captureError) {
                console.log('Could not capture screenshot:', captureError.message);
            }
        }

        // Create log entry
        const entry = {
            time: new Date().toISOString(),
            title: tab.title || 'Unknown',
            url: tab.url,
            screenshot: screenshot
        };

        // Save to storage
        chrome.storage.local.get({ logs: [] }, (data) => {
            data.logs.push(entry);
            chrome.storage.local.set({ logs: data.logs });
        });
        
        console.log('Logged tab:', tab.title);
        
    } catch (error) {
        console.error('Error in captureAndLog:', error);
    }
}

chrome.runtime.onStartup.addListener(() => {
    console.log("Study Timer extension started");
});