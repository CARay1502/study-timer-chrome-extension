chrome.runtime.onInstalled.addListener(() => {
    console.log("Study Timer extension installed.");
    
    // Initialize storage if needed
    chrome.storage.local.get({ logs: [] }, (data) => {
        if (!data.logs) {
            chrome.storage.local.set({ logs: [] });
        }
    });
});

// Handle tab updates to potentially log active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
    // This could be used to track tab switches during study sessions
    // For now, just logging for debugging
    console.log('Tab activated:', activeInfo.tabId);
});

// Clean up old logs periodically (optional feature)
chrome.runtime.onStartup.addListener(() => {
    // You could add logic here to clean up logs older than X days
    console.log("Study Timer extension started.");
});