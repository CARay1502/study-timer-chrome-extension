// Background.js is responsible for all of the persistent states and logic. 
// Also I have a ton of console logs which were helpful for dev but technically shouldnt be included in production code. 
// I'll delete later, but rn its still helpful for development.

// Configuration
const STUDY_MINUTES = 25;
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
    let totalSeconds = STUDY_MINUTES * 60; // Fixed: declare totalSecodns 
    let elapsedSeconds = 0;

    if (timerState.isRunning && timerState.endTime) {
        secondsLeft = Math.max(0, Math.floor((timerState.endTime - now) / 1000));
        elapsedSeconds = totalSeconds - secondsLeft; // Calculate elapsed time for stupid ring thing that I thought was cool but then realized is a lot of work and now I really regret very much. >:(
    }
    
    return {
        isRunning: timerState.isRunning, 
        startTime: timerState.startTime, // Initial time for calc elapsed & secondsLeft
        endTime: timerState.endTime, 
        secondsLeft: secondsLeft,
        totalSeconds: totalSeconds, // Always return the full duration as well
        elapsedSeconds: elapsedSeconds, // Add elapsed seconds for easier calculation
        totalMinutes: timerState.startTime ? Math.round((now - timerState.startTime) / 60000) : 0
    };
}

// new play function for playCompletionSound() when timer is up
// Creaet new offscreen doc for audio background
async function createOffscreenDocument() {
    if (offscreenDocumentCreated) return;

    // The only way to get sound to play (persistently) is witha background or 'offscreen' html doc
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

// Function for starting session, initializing timer and returnign timer values
function startStudySession() {
    if (timerState.isRunning) return;
    
    const now = Date.now();
    timerState.isRunning = true;
    timerState.startTime = now;
    timerState.endTime = now + (STUDY_MINUTES * 60 * 1000);
    
    // Set up countdown timer by getTimerState()
    timerState.countdownTimer = setInterval(() => {
        const state = getTimerState();

        chrome.runtime.sendMessage({ 
            action: 'timerUpdate', 
            state: state 
        }).catch(() => {
            // Popup not open, ignore error
            // Ignore this amazing error handling lol
        });
        
        // Stop sesh if seconds is 0 (or for whatever reason less than 0??)
        if (state.secondsLeft <= 0) {
            stopStudySession();
        }
    }, 1000);
    
    // Set up screenshot logging intervals 
    captureAndLog(); // Initialize with capture at start 
    timerState.captureInterval = setInterval(captureAndLog, LOG_INTERVAL_MS);
    
    console.log('Study session started'); 
}

// function for stoping the session, reseting states to null, playing sound and final capture log. 
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
    

    //This needs to be fixed. I was trying to get it to pop up a chrome notification but idk what this is lol
    // Notify popup if it's open
    chrome.runtime.sendMessage({ 
        action: 'timerStopped', 
        state: getTimerState() 
    }).catch(() => {
        // Popup not open, ignore error
        // Igrnore this error handling lol
    });
    
    console.log('Study session stopped');
}

async function captureAndLog() {
    try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        let screenshot = null;
        
        // CApture URL's, skips if protected URL (for extra privacy)
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