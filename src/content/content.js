// Initialize content script
console.log('WhatsInspect content script loaded');

// Function to notify background script that monitoring should start
function initializeMonitoring() {
  chrome.runtime.sendMessage({ 
    type: 'INITIALIZE_MONITORING',
    url: window.location.href 
  }, response => {
    console.log('Monitoring initialization response:', response);
  });
}

// Function to detect WhatsApp Web authentication
function detectAuthentication() {
  // Watch for changes in the DOM that indicate successful authentication
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        // Check for elements that indicate successful WhatsApp Web login
        const authElement = document.querySelector('.app');
        if (authElement) {
          console.log('WhatsApp Web authentication detected');
          chrome.runtime.sendMessage({ 
            type: 'AUTHENTICATION_DETECTED' 
          }, response => {
            console.log('Authentication notification response:', response);
          });
          observer.disconnect();
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Function to display captured data
function displayCapturedData(data) {
  console.log('Captured Data:', data);
  // Store the captured data
  chrome.runtime.sendMessage({
    type: 'STORE_CAPTURED_DATA',
    data: data
  });
}

// Initialize monitoring when the page loads
if (window.location.hostname === 'web.whatsapp.com') {
  console.log('WhatsApp Web detected, initializing monitoring...');
  initializeMonitoring();
  detectAuthentication();
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CAPTURED_DATA':
      displayCapturedData(message.data);
      sendResponse({ status: 'data_displayed' });
      break;
    case 'MONITORING_STATUS':
      console.log('Monitoring status:', message.status);
      sendResponse({ status: 'status_received' });
      break;
  }
  return true;
}); 