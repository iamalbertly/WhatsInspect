// Listen for installation event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('WhatsInspect extension installed');
    // Initialize any required storage or settings
    chrome.storage.local.set({ isEnabled: false });
  }
});

// Import MQTT packet decoder
import mqtt from 'mqtt-packet';
import CryptoJS from 'crypto-js'; // Import crypto-js for encryption

// Function to encrypt data
function encryptData(data) {
  return CryptoJS.AES.encrypt(JSON.stringify(data), 'secret-key').toString();
}

// Function to decrypt data
function decryptData(ciphertext) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, 'secret-key');
  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
}

// Function to decode MQTT messages
function decodeMQTTMessage(data) {
  try {
    const packet = mqtt.parser();
    packet.on('packet', (packet) => {
      console.log('Decoded MQTT packet:', packet);
      // Log the packet with metadata
      logCapturedData(packet);
    });
    packet.parse(data);
  } catch (error) {
    console.error('Error decoding MQTT message:', error);
  }
}

// Function to log captured data securely
function logCapturedData(data) {
  const timestamp = new Date().toISOString();
  const encryptedData = encryptData({ timestamp, data });
  console.log(`[${timestamp}] Captured Data:`, encryptedData);
  // Store encrypted data
  chrome.storage.local.set({ [`data_${timestamp}`]: encryptedData });
}

// Function to handle WebSocket messages with batching
let messageQueue = [];
function handleWebSocketMessages(details) {
  if (details.type === 'websocket') {
    console.log('WebSocket connection detected:', details);
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        const data = details.requestBody.raw[0].bytes;
        messageQueue.push(data);
        if (messageQueue.length >= 10) { // Process in batches of 10
          const batch = messageQueue.splice(0, 10);
          batch.forEach(decodeMQTTMessage);
        }
      },
      { urls: ["wss://web.whatsapp.com/*"] },
      ["requestBody"]
    );
  }
  return { cancel: false };
}

// Periodically process remaining messages
setInterval(() => {
  if (messageQueue.length > 0) {
    const batch = messageQueue.splice(0, messageQueue.length);
    batch.forEach(decodeMQTTMessage);
  }
}, 5000); // Process every 5 seconds

// Listen for network requests
chrome.webRequest.onBeforeRequest.addListener(
  handleWebSocketMessages,
  { urls: ["<all_urls>"] },
  ["blocking", "requestBody"]
); 