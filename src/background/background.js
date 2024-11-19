// Import from relative paths
import { mqtt } from '../lib/mqtt-packet.js';

// State management
let isMonitoring = false;
let monitoringTabId = null;
let dataBatch = [];
const BATCH_SIZE = 20;
const MAX_STORAGE_ITEMS = 1000;
const BATCH_INTERVAL = 2000; // 2 seconds
const CLEANUP_INTERVAL = 1800000; // 30 minutes

// Storage configuration
const STORAGE_CONFIG = {
  maxItems: MAX_STORAGE_ITEMS,
  retentionDays: 7,
  batchSize: BATCH_SIZE
};

// Initialize storage configuration
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('WhatsInspect extension installed');
    chrome.storage.local.set({ 
      isEnabled: true,
      monitoringStatus: 'inactive',
      storageConfig: STORAGE_CONFIG
    });
    initializeStorageCleanup();
  }
});

// Batch processing timer
let batchTimeout = null;

// Function to process data batch
function processBatch() {
  if (dataBatch.length > 0) {
    const batchToStore = {};
    const timestamp = new Date().toISOString();
    
    dataBatch.forEach((data, index) => {
      const key = `data_${timestamp}_${index}`;
      batchToStore[key] = encryptData(data);
    });

    chrome.storage.local.set(batchToStore, () => {
      console.log(`Stored batch of ${dataBatch.length} items`);
      dataBatch = [];
    });
  }
  batchTimeout = null;
}

// Enhanced log captured data function
function logCapturedData(data) {
  const timestamp = new Date().toISOString();
  const metadata = {
    timestamp,
    type: data.type || 'unknown',
    source: 'whatsapp_web',
    sessionId: monitoringTabId
  };

  const storedData = {
    ...metadata,
    data: data.data || data
  };

  dataBatch.push(storedData);

  if (dataBatch.length >= BATCH_SIZE) {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
    }
    processBatch();
  } else if (!batchTimeout) {
    batchTimeout = setTimeout(processBatch, BATCH_INTERVAL);
  }
}

// Function to clean up old data
async function cleanupOldData() {
  try {
    const { storageConfig } = await chrome.storage.local.get('storageConfig');
    const maxAge = storageConfig.retentionDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const now = new Date().getTime();

    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items)
        .filter(key => key.startsWith('data_'))
        .filter(key => {
          try {
            const data = JSON.parse(atob(items[key]));
            const itemAge = now - new Date(data.timestamp).getTime();
            return itemAge > maxAge;
          } catch (error) {
            console.error('Error processing item for cleanup:', error);
            return false;
          }
        });

      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => {
          console.log(`Cleaned up ${keysToRemove.length} old items`);
        });
      }
    });
  } catch (error) {
    console.error('Error during storage cleanup:', error);
  }
}

// Initialize storage cleanup interval
function initializeStorageCleanup() {
  // Initial cleanup
  cleanupOldData();
  
  // Set up periodic cleanup
  setInterval(cleanupOldData, CLEANUP_INTERVAL);
}

// Function to update storage configuration
function updateStorageConfig(newConfig) {
  chrome.storage.local.get('storageConfig', (result) => {
    const updatedConfig = { ...result.storageConfig, ...newConfig };
    chrome.storage.local.set({ storageConfig: updatedConfig }, () => {
      console.log('Storage configuration updated:', updatedConfig);
    });
  });
}

// Function to start monitoring
function startMonitoring(tabId) {
  if (!isMonitoring) {
    isMonitoring = true;
    monitoringTabId = tabId;
    chrome.storage.local.set({ 
      monitoringStatus: 'active',
      monitoringTabId: tabId 
    });
    console.log('Monitoring started for tab:', tabId);
  }
}

// Function to stop monitoring
function stopMonitoring() {
  isMonitoring = false;
  monitoringTabId = null;
  chrome.storage.local.set({ 
    monitoringStatus: 'inactive',
    monitoringTabId: null 
  });
  console.log('Monitoring stopped');
}

// Function to encrypt data (using built-in methods instead of crypto-js)
function encryptData(data) {
  // Simple encryption for demo purposes
  return btoa(JSON.stringify(data));
}

// Function to decrypt data
function decryptData(ciphertext) {
  // Simple decryption for demo purposes
  return JSON.parse(atob(ciphertext));
}

// Function to decode MQTT messages
function decodeMQTTMessage(data) {
  try {
    const packet = mqtt.parser();
    packet.on('packet', (packet) => {
      console.log('Decoded MQTT packet:', packet);
      logCapturedData(packet);
    });
    packet.parse(data);
  } catch (error) {
    console.error('Error decoding MQTT message:', error);
  }
}

// Enhanced WebSocket message handling
function handleWebSocketMessages(details) {
  if (!isMonitoring || details.tabId !== monitoringTabId) return { cancel: false };

  if (details.type === 'websocket') {
    try {
      // Process WebSocket data
      const wsData = processWebSocketData(details);
      if (wsData) {
        logCapturedData(wsData);
      }

      // If there's request body data, process it as MQTT
      if (details.requestBody && details.requestBody.raw) {
        const rawData = details.requestBody.raw[0].bytes;
        messageQueue.push(rawData);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }
  return { cancel: false };
}

// Function to process WebSocket data
function processWebSocketData(details) {
  const url = new URL(details.url);
  const timestamp = new Date().toISOString();

  // Basic structure for WebSocket data
  const wsData = {
    type: 'websocket',
    timestamp: timestamp,
    data: {
      url: url.pathname,
      protocol: url.protocol,
      headers: details.requestHeaders
    }
  };

  // Identify specific WebSocket events
  if (url.pathname.includes('/chat')) {
    wsData.type = 'chat_connection';
  } else if (url.pathname.includes('/presence')) {
    wsData.type = 'presence_connection';
  }

  return wsData;
}

// Enhanced message queue processing
let messageQueue = [];
const BATCH_SIZE = 10;
const PROCESS_INTERVAL = 500; // Process every 500ms

setInterval(() => {
  if (messageQueue.length > 0 && isMonitoring) {
    const batch = messageQueue.splice(0, BATCH_SIZE);
    batch.forEach(data => {
      try {
        decodeMQTTMessage(data);
      } catch (error) {
        console.error('Error processing message batch:', error);
      }
    });
  }
}, PROCESS_INTERVAL);

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'INITIALIZE_MONITORING':
      if (sender.tab && message.url.includes('web.whatsapp.com')) {
        startMonitoring(sender.tab.id);
        sendResponse({ status: 'monitoring_initialized' });
      }
      break;

    case 'AUTHENTICATION_DETECTED':
      if (sender.tab && sender.tab.id === monitoringTabId) {
        console.log('Authentication confirmed, enhancing monitoring...');
        // Enhance monitoring with authentication-specific features
        logCapturedData({
          type: 'authentication',
          timestamp: new Date().toISOString()
        });
        sendResponse({ status: 'monitoring_enhanced' });
      }
      break;

    case 'STORE_CAPTURED_DATA':
      logCapturedData(message.data);
      sendResponse({ status: 'data_stored' });
      break;
  }
  return true;
});

// Listen for network requests with enhanced filtering
chrome.webRequest.onBeforeRequest.addListener(
  handleWebSocketMessages,
  { 
    urls: ["wss://web.whatsapp.com/*", "https://web.whatsapp.com/*"],
    types: ["websocket"]
  },
  ["requestBody"]
);

// Listen for tab closure to stop monitoring if needed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === monitoringTabId) {
    stopMonitoring();
  }
}); 