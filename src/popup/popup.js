document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggleInspect');
  const statusText = document.getElementById('statusText');

  // Check current state
  chrome.storage.local.get(['isEnabled'], function(result) {
    updateUI(result.isEnabled);
  });

  toggleButton.addEventListener('click', function() {
    chrome.storage.local.get(['isEnabled'], function(result) {
      const newState = !result.isEnabled;
      chrome.storage.local.set({ isEnabled: newState }, function() {
        updateUI(newState);
      });
    });
  });

  function updateUI(isEnabled) {
    toggleButton.textContent = isEnabled ? 'Stop Inspection' : 'Start Inspection';
    statusText.textContent = `Status: ${isEnabled ? 'Active' : 'Inactive'}`;
  }

  // Listen for authentication detection
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTHENTICATION_DETECTED') {
      updateUI(true); // Assume monitoring starts on authentication
      console.log('UI updated for authentication detection');
    }
  });
}); 