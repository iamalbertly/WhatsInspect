// Initialize content script
console.log('WhatsInspect content script loaded');

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'INSPECT_START') {
    // Handle inspection start
    console.log('Starting inspection');
    sendResponse({ status: 'started' });
  }
  if (message.type === 'AUTHENTICATION_DETECTED') {
    console.log('Authentication detected, starting data monitoring');
    // Start data monitoring processes here
    sendResponse({ status: 'monitoring_started' });
  }
  if (message.type === 'CAPTURED_DATA') {
    displayCapturedData(message.data);
    sendResponse({ status: 'data_displayed' });
  }
  return true;
});

// Function to display captured data
function displayCapturedData(data) {
  console.log('Captured Data:', data);
  // Implement UI updates or data processing as needed
} 