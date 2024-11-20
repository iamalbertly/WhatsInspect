// Initialize content script
console.log('WhatsInspect content script loaded');

// Constants for DOM selectors
const DOM_SELECTORS = {
  CHAT_LIST: '._3pkkz, .zoWT4, [data-testid="chat-list"]', // Multiple possible selectors
  CONTACT_NAME: '[data-testid="cell-frame-title"], .zoWT4 span[title], ._3pkkz span[title]',
  CHAT_CONTAINER: '.app-wrapper-web',
  LOADING_INDICATOR: '[data-testid="loading"]',
  ACTIVE_CHAT_HEADER: '[data-testid="conversation-header"]',
  ACTIVE_CHAT_NAME: '[data-testid="conversation-title"]',
  MESSAGE_LIST: '[data-testid="conversation-panel-messages"]',
  MESSAGE_IN: '[data-testid="msg-container"][class*="message-in"]',
  MESSAGE_OUT: '[data-testid="msg-container"][class*="message-out"]',
  MESSAGE_TEXT: 'span[data-testid="msg-text"]',
  MESSAGE_TIME: 'span[data-testid="msg-time"]',
  CHAT_SEARCH_INPUT: '[data-testid="chat-list-search"]',
  MESSAGE_CONTAINER: '[data-testid="conversation-panel-messages"]',
  MESSAGE_WRAPPER: '[data-testid="msg-container"]',
  MESSAGE_BUBBLE: '[data-testid="message-bubble"]',
  MESSAGE_META: '[data-testid="msg-meta"]',
  SENDER_NAME: '[data-testid="msg-contact-name"]',
  GROUP_MESSAGE_HEADER: '[data-testid="msg-group"]',
  UNREAD_INDICATOR: '[data-testid="unread-count"]',
  CHAT_SEARCH_BOX: '[data-testid="chat-list-search"]',
  CHAT_LIST_ITEM: '[data-testid="cell-frame-container"]',
  SEARCH_BACK_BUTTON: '[data-testid="back"]',
  NO_CHAT_FOUND: '[data-testid="no-chat-found"]',
  CHAT_ITEM_TITLE: '[data-testid="cell-frame-title"]',
  CHAT_LIST_CONTAINER: '[aria-label="Chat list"]',
  CONTACT_INFO: '[data-testid="cell-frame-title"]',
  CONTACT_STATUS: '[data-testid="cell-frame-secondary"]',
  CONTACT_PICTURE: '[data-testid="cell-frame-primary"] img',
  CHAT_ID_ATTRIBUTE: 'data-id',
  UNREAD_COUNTER: '[data-testid="unread-count"]',
  COPYABLE_AREA: '[data-testid="conversation-panel-messages"]',
  MESSAGE_CONTENT: {
    TEXT: '[data-testid="msg-text"]',
    IMAGE: 'img[data-testid="image-thumb"]',
    VIDEO: 'video[data-testid="video-content"]',
    AUDIO: 'audio[data-testid="audio-content"]',
    DOCUMENT: '[data-testid="document-thumb"]',
    LINK_PREVIEW: '[data-testid="link-preview"]'
  },
  MESSAGE_STATUS: '[data-testid="msg-status"]',
  MESSAGE_TIMESTAMP: '[data-testid="msg-time"]',
  MESSAGE_SENDER: '[data-testid="msg-contact-name"]',
  MESSAGE_QUOTE: '[data-testid="quoted-message"]',
  MESSAGE_REACTIONS: '[data-testid="reaction-bubble"]',
  MESSAGE_QUEUE_CONTAINER: '[data-testid="conversation-panel-messages"]',
  MESSAGE_ROW: '[data-testid="msg-container"]'
};

// Message monitoring state
const messageMonitorState = {
  processedIds: new Set(),
  pendingMessages: [],
  isProcessing: false,
  lastProcessTime: 0,
  THROTTLE_MS: 500,
  BATCH_SIZE: 10
};

/**
 * Enhanced message monitoring with throttling and batching
 * @returns {MutationObserver} Configured observer instance
 */
function monitorNewMessages() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (isValidMessageNode(node)) {
            queueMessageForProcessing(node);
          }
        });
      }
    }
  });

  // Initialize observer on message container
  initializeMessageObserver(observer);
  return observer;
}

/**
 * Validates if a node is a valid message element
 * @param {Node} node - DOM node to check
 * @returns {boolean} Whether node is a valid message
 */
function isValidMessageNode(node) {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    node.matches(DOM_SELECTORS.MESSAGE_ROW) &&
    node.getAttribute('data-id')
  );
}

/**
 * Initializes the message observer with retry mechanism
 * @param {MutationObserver} observer - Observer instance
 */
function initializeMessageObserver(observer) {
  const container = document.querySelector(DOM_SELECTORS.MESSAGE_QUEUE_CONTAINER);
  
  if (container) {
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: false
    });
    console.log('Message monitoring initialized');
  } else {
    console.log('Message container not found, retrying in 2s...');
    setTimeout(() => initializeMessageObserver(observer), 2000);
  }
}

/**
 * Queues a message for processing with throttling
 * @param {Element} messageNode - Message DOM node
 */
function queueMessageForProcessing(messageNode) {
  try {
    const messageId = messageNode.getAttribute('data-id');
    
    if (messageMonitorState.processedIds.has(messageId)) {
      return; // Skip if already processed
    }

    messageMonitorState.processedIds.add(messageId);
    messageMonitorState.pendingMessages.push(messageNode);

    scheduleMessageProcessing();
  } catch (error) {
    console.error('Error queuing message:', error);
  }
}

/**
 * Schedules processing of pending messages with throttling
 */
function scheduleMessageProcessing() {
  if (messageMonitorState.isProcessing) {
    return;
  }

  const now = Date.now();
  const timeUntilNextProcess = Math.max(
    0,
    messageMonitorState.lastProcessTime + messageMonitorState.THROTTLE_MS - now
  );

  setTimeout(processPendingMessages, timeUntilNextProcess);
}

/**
 * Processes pending messages in batches
 */
async function processPendingMessages() {
  if (messageMonitorState.isProcessing || messageMonitorState.pendingMessages.length === 0) {
    return;
  }

  messageMonitorState.isProcessing = true;
  messageMonitorState.lastProcessTime = Date.now();

  try {
    // Process messages in batches
    const batch = messageMonitorState.pendingMessages
      .splice(0, messageMonitorState.BATCH_SIZE)
      .map(extractMessageData)
      .filter(Boolean);

    if (batch.length > 0) {
      // Log batch of messages
      logCapturedData({
        type: 'message_batch',
        source: 'dom_monitor',
        timestamp: new Date().toISOString(),
        data: {
          messages: batch,
          batchSize: batch.length
        }
      });
    }

  } catch (error) {
    console.error('Error processing message batch:', error);
  } finally {
    messageMonitorState.isProcessing = false;

    // Schedule next batch if there are more messages
    if (messageMonitorState.pendingMessages.length > 0) {
      scheduleMessageProcessing();
    }
  }
}

/**
 * Extracts message data from DOM node
 * @param {Element} messageNode - Message DOM node
 * @returns {Object|null} Extracted message data
 */
function extractMessageData(messageNode) {
  try {
    const messageId = messageNode.getAttribute('data-id');
    const isIncoming = messageNode.classList.contains('message-in');
    
    return {
      id: messageId,
      timestamp: extractTimestamp(messageNode),
      sender: extractSender(messageNode, isIncoming),
      direction: isIncoming ? 'incoming' : 'outgoing',
      content: extractMessageContent(messageNode),
      metadata: {
        status: extractMessageStatus(messageNode),
        starred: isMessageStarred(messageNode),
        reactions: extractReactions(messageNode),
        quoted: extractQuotedMessage(messageNode)
      }
    };
  } catch (error) {
    console.error('Error extracting message data:', error);
    return null;
  }
}

/**
 * Extracts detailed information from a message node
 * @param {Element} messageNode - The message DOM node
 * @returns {Object|null} Extracted message data or null if invalid
 */
function extractMessageData(messageNode) {
  const textElement = messageNode.querySelector(DOM_SELECTORS.MESSAGE_TEXT);
  const timeElement = messageNode.querySelector(DOM_SELECTORS.MESSAGE_TIME);
  const senderElement = messageNode.querySelector(DOM_SELECTORS.SENDER_NAME);

  if (!textElement || !timeElement) {
    return null;
  }

  const isIncoming = messageNode.classList.contains('message-in');
  const timestamp = timeElement.getAttribute('data-time') || timeElement.textContent;
  
  return {
    content: textElement.textContent.trim(),
    timestamp: new Date(timestamp).toISOString(),
    direction: isIncoming ? 'incoming' : 'outgoing',
    sender: senderElement ? senderElement.textContent.trim() : (isIncoming ? getCurrentChatName() : 'You'),
    messageType: determineMessageType(messageNode),
    metadata: extractMessageMetadata(messageNode)
  };
}

/**
 * Determines the type of message (text, media, etc.)
 * @param {Element} messageNode - The message DOM node
 * @returns {string} Message type identifier
 */
function determineMessageType(messageNode) {
  if (messageNode.querySelector('img[data-testid="image-thumb"]')) {
    return 'image';
  }
  if (messageNode.querySelector('[data-testid="audio-player"]')) {
    return 'audio';
  }
  if (messageNode.querySelector('[data-testid="video-player"]')) {
    return 'video';
  }
  if (messageNode.querySelector('[data-testid="document-thumb"]')) {
    return 'document';
  }
  return 'text';
}

/**
 * Extracts additional metadata from the message
 * @param {Element} messageNode - The message DOM node
 * @returns {Object} Additional message metadata
 */
function extractMessageMetadata(messageNode) {
  return {
    isForwarded: !!messageNode.querySelector('[data-testid="forwarded"]'),
    isStarred: !!messageNode.querySelector('[data-testid="star-btn"][data-starred="true"]'),
    hasReactions: !!messageNode.querySelector('[data-testid="reaction-bubble"]'),
    isGroupMessage: !!messageNode.closest(DOM_SELECTORS.GROUP_MESSAGE_HEADER)
  };
}

/**
 * Extracts contacts from WhatsApp Web with enhanced data
 * @returns {Promise<Object>} Object containing contacts array and status
 */
async function extractContacts() {
  return new Promise((resolve) => {
    const contacts = [];
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_INTERVAL = 2000;

    function attemptExtraction() {
      try {
        // Find the chat list container
        const chatListContainer = document.querySelector(DOM_SELECTORS.CHAT_LIST_CONTAINER);
        
        if (!chatListContainer) {
          if (retryCount < MAX_RETRIES) {
            console.log(`Chat list not found, retry ${retryCount + 1}/${MAX_RETRIES}`);
            retryCount++;
            setTimeout(attemptExtraction, RETRY_INTERVAL);
            return;
          }
          resolve({
            success: false,
            error: 'Chat list container not found after retries',
            contacts: []
          });
          return;
        }

        // Get all chat items
        const chatItems = chatListContainer.querySelectorAll(DOM_SELECTORS.CHAT_LIST_ITEM);
        
        if (chatItems.length === 0) {
          resolve({
            success: true,
            message: 'No contacts found',
            contacts: []
          });
          return;
        }

        // Process each chat item
        chatItems.forEach(chatItem => {
          try {
            const contactInfo = extractContactInfo(chatItem);
            if (contactInfo) {
              contacts.push(contactInfo);
            }
          } catch (error) {
            console.error('Error processing chat item:', error);
          }
        });

        resolve({
          success: true,
          contacts,
          timestamp: new Date().toISOString(),
          source: 'dom_extraction'
        });

      } catch (error) {
        console.error('Error in contact extraction:', error);
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          setTimeout(attemptExtraction, RETRY_INTERVAL);
        } else {
          resolve({
            success: false,
            error: error.message,
            contacts: []
          });
        }
      }
    }

    // Start extraction attempt
    attemptExtraction();
  });
}

/**
 * Extracts detailed contact information from a chat item
 * @param {Element} chatItem - The chat item DOM element
 * @returns {Object|null} Contact information object or null if invalid
 */
function extractContactInfo(chatItem) {
  try {
    // Get contact name
    const nameElement = chatItem.querySelector(DOM_SELECTORS.CONTACT_INFO);
    if (!nameElement) return null;

    const name = nameElement.getAttribute('title') || nameElement.textContent.trim();
    if (!name) return null;

    // Extract chat ID from data attributes
    const chatId = extractChatId(chatItem);

    // Build contact object with enhanced information
    const contactInfo = {
      name,
      chatId,
      type: 'contact',
      timestamp: new Date().toISOString(),
      metadata: {
        status: extractStatus(chatItem),
        unreadCount: extractUnreadCount(chatItem),
        pictureUrl: extractPictureUrl(chatItem),
        isGroup: isGroupChat(chatItem),
        lastSeen: extractLastSeen(chatItem)
      }
    };

    return contactInfo;
  } catch (error) {
    console.error('Error extracting contact info:', error);
    return null;
  }
}

/**
 * Extracts chat ID from various possible attributes
 * @param {Element} chatItem - The chat item element
 * @returns {string} Extracted chat ID or generated fallback
 */
function extractChatId(chatItem) {
  // Try different possible attribute locations
  const idFromData = chatItem.getAttribute(DOM_SELECTORS.CHAT_ID_ATTRIBUTE);
  if (idFromData) return idFromData;

  // Try to find ID in child elements
  const idElement = chatItem.querySelector('[data-id]');
  if (idElement) return idElement.getAttribute('data-id');

  // Generate fallback ID if none found
  return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Utility functions for extracting additional contact information
 */
function extractStatus(chatItem) {
  const statusElement = chatItem.querySelector(DOM_SELECTORS.CONTACT_STATUS);
  return statusElement ? statusElement.textContent.trim() : '';
}

function extractUnreadCount(chatItem) {
  const unreadElement = chatItem.querySelector(DOM_SELECTORS.UNREAD_COUNTER);
  return unreadElement ? parseInt(unreadElement.textContent) || 0 : 0;
}

function extractPictureUrl(chatItem) {
  const imgElement = chatItem.querySelector(DOM_SELECTORS.CONTACT_PICTURE);
  return imgElement ? imgElement.src : '';
}

function isGroupChat(chatItem) {
  return !!chatItem.querySelector('[data-testid="group-chat-icon"]');
}

function extractLastSeen(chatItem) {
  const lastSeenElement = chatItem.querySelector('[data-testid="last-seen"]');
  return lastSeenElement ? lastSeenElement.textContent.trim() : '';
}

// Enhanced monitoring initialization
async function initializeMonitoring() {
  let contactData = null;
  let messageObserver = null;

  // Try WebSocket monitoring first
  chrome.runtime.sendMessage({ 
    type: 'INITIALIZE_MONITORING',
    url: window.location.href 
  }, async response => {
    console.log('Monitoring initialization response:', response);
    
    if (response && response.status === 'monitoring_initialized') {
      contactData = { source: 'websocket', status: 'active' };
    } else {
      console.log('Falling back to DOM extraction...');
      contactData = await extractContacts();
    }

    // Initialize message monitoring regardless of WebSocket status
    messageObserver = monitorNewMessages();

    // Store the contact data with source information
    if (contactData && contactData.contacts) {
      chrome.runtime.sendMessage({
        type: 'STORE_CAPTURED_DATA',
        data: contactData
      });
    }
  });

  return messageObserver;
}

// Enhanced authentication detection
function detectAuthentication() {
  const observer = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        const authElement = document.querySelector(DOM_SELECTORS.CHAT_CONTAINER);
        if (authElement) {
          console.log('WhatsApp Web authentication detected');
          
          // Notify background script
          chrome.runtime.sendMessage({ 
            type: 'AUTHENTICATION_DETECTED' 
          }, async response => {
            console.log('Authentication notification response:', response);
            
            // Start periodic DOM checks for new contacts
            startPeriodicContactCheck();
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

// Periodic contact check
let contactCheckInterval = null;

function startPeriodicContactCheck() {
  if (contactCheckInterval) {
    clearInterval(contactCheckInterval);
  }

  contactCheckInterval = setInterval(async () => {
    const result = await extractContacts();
    if (result.contacts.length > 0) {
      chrome.runtime.sendMessage({
        type: 'STORE_CAPTURED_DATA',
        data: {
          type: 'contacts_update',
          source: 'dom_periodic',
          timestamp: new Date().toISOString(),
          data: result.contacts
        }
      });
    }
  }, 30000); // Check every 30 seconds
}

// Enhanced display function
function displayCapturedData(data) {
  console.log(`Captured Data (${data.source || 'unknown source'}):`, data);
  chrome.runtime.sendMessage({
    type: 'STORE_CAPTURED_DATA',
    data: {
      ...data,
      source: data.source || 'unknown'
    }
  });
}

/**
 * Extracts messages from a specific chat
 * @param {string} chatId - The unique identifier of the chat
 * @returns {Promise<Object>} Object containing messages array and status
 */
async function extractMessages(chatId) {
  return new Promise(async (resolve) => {
    try {
      // Verify chat is active and matches chatId
      const currentChatId = await getCurrentChatId();
      if (!currentChatId) {
        resolve({
          success: false,
          error: 'No active chat found',
          messages: []
        });
        return;
      }

      if (currentChatId !== chatId) {
        resolve({
          success: false,
          error: 'Active chat does not match requested chatId',
          messages: []
        });
        return;
      }

      // Get message container
      const messageArea = document.querySelector(DOM_SELECTORS.COPYABLE_AREA);
      if (!messageArea) {
        resolve({
          success: false,
          error: 'Message container not found',
          messages: []
        });
        return;
      }

      // Extract messages
      const messages = [];
      const messageElements = messageArea.querySelectorAll(DOM_SELECTORS.MESSAGE_CONTAINER);

      for (const element of messageElements) {
        const messageData = await extractMessageDetails(element);
        if (messageData) {
          messages.push(messageData);
        }
      }

      resolve({
        success: true,
        messages,
        metadata: {
          chatId,
          extractionTime: new Date().toISOString(),
          messageCount: messages.length
        }
      });

    } catch (error) {
      console.error('Error extracting messages:', error);
      resolve({
        success: false,
        error: error.message,
        messages: []
      });
    }
  });
}

/**
 * Extracts detailed information from a message element
 * @param {Element} messageElement - The message DOM element
 * @returns {Promise<Object|null>} Message data object or null if invalid
 */
async function extractMessageDetails(messageElement) {
  try {
    // Get message ID
    const messageId = messageElement.getAttribute('data-id');
    if (!messageId) return null;

    // Determine message direction
    const isIncoming = messageElement.classList.contains('message-in');
    const isOutgoing = messageElement.classList.contains('message-out');
    if (!isIncoming && !isOutgoing) return null;

    // Base message object
    const messageData = {
      id: messageId,
      direction: isIncoming ? 'incoming' : 'outgoing',
      timestamp: extractTimestamp(messageElement),
      sender: extractSender(messageElement, isIncoming),
      type: 'unknown',
      content: null,
      metadata: {
        status: extractMessageStatus(messageElement),
        isStarred: isMessageStarred(messageElement),
        reactions: extractReactions(messageElement),
        quotedMessage: extractQuotedMessage(messageElement)
      }
    };

    // Determine message type and extract content
    const contentData = await extractMessageContent(messageElement);
    messageData.type = contentData.type;
    messageData.content = contentData.content;

    return messageData;

  } catch (error) {
    console.error('Error extracting message details:', error);
    return null;
  }
}

/**
 * Extracts message content based on type
 * @param {Element} messageElement - The message element
 * @returns {Promise<Object>} Object containing content type and data
 */
async function extractMessageContent(messageElement) {
  const contentTypes = DOM_SELECTORS.MESSAGE_CONTENT;
  
  // Check each content type in order
  if (messageElement.querySelector(contentTypes.TEXT)) {
    return {
      type: 'text',
      content: messageElement.querySelector(contentTypes.TEXT).textContent.trim()
    };
  }
  
  if (messageElement.querySelector(contentTypes.IMAGE)) {
    const img = messageElement.querySelector(contentTypes.IMAGE);
    return {
      type: 'image',
      content: {
        src: img.src,
        caption: extractMediaCaption(messageElement)
      }
    };
  }

  if (messageElement.querySelector(contentTypes.VIDEO)) {
    const video = messageElement.querySelector(contentTypes.VIDEO);
    return {
      type: 'video',
      content: {
        src: video.src,
        caption: extractMediaCaption(messageElement)
      }
    };
  }

  if (messageElement.querySelector(contentTypes.AUDIO)) {
    return {
      type: 'audio',
      content: {
        duration: extractAudioDuration(messageElement)
      }
    };
  }

  if (messageElement.querySelector(contentTypes.DOCUMENT)) {
    return {
      type: 'document',
      content: {
        filename: extractDocumentName(messageElement),
        extension: extractDocumentExtension(messageElement)
      }
    };
  }

  if (messageElement.querySelector(contentTypes.LINK_PREVIEW)) {
    return {
      type: 'link',
      content: extractLinkPreview(messageElement)
    };
  }

  return {
    type: 'unknown',
    content: null
  };
}

/**
 * Utility functions for extracting message components
 */
function extractTimestamp(element) {
  const timeElement = element.querySelector(DOM_SELECTORS.MESSAGE_TIMESTAMP);
  return timeElement ? timeElement.getAttribute('data-time') || timeElement.textContent.trim() : null;
}

function extractSender(element, isIncoming) {
  if (!isIncoming) return 'You';
  const senderElement = element.querySelector(DOM_SELECTORS.MESSAGE_SENDER);
  return senderElement ? senderElement.textContent.trim() : 'Unknown';
}

function extractMessageStatus(element) {
  const statusElement = element.querySelector(DOM_SELECTORS.MESSAGE_STATUS);
  return statusElement ? statusElement.getAttribute('aria-label') || statusElement.textContent.trim() : null;
}

function isMessageStarred(element) {
  return !!element.querySelector('[data-testid="star-btn"][data-starred="true"]');
}

function extractReactions(element) {
  const reactions = [];
  element.querySelectorAll(DOM_SELECTORS.MESSAGE_REACTIONS).forEach(reaction => {
    reactions.push({
      emoji: reaction.textContent.trim(),
      count: parseInt(reaction.getAttribute('data-count') || '1')
    });
  });
  return reactions;
}

function extractQuotedMessage(element) {
  const quoteElement = element.querySelector(DOM_SELECTORS.MESSAGE_QUOTE);
  if (!quoteElement) return null;
  
  return {
    text: quoteElement.textContent.trim(),
    sender: quoteElement.querySelector('[data-testid="quoted-message-author"]')?.textContent.trim()
  };
}

/**
 * Gets the name of the currently active chat
 * @returns {string|null} - Current chat name or null if no chat is active
 */
function getCurrentChatName() {
  const headerElement = document.querySelector(DOM_SELECTORS.ACTIVE_CHAT_NAME);
  return headerElement ? headerElement.textContent.trim() : null;
}

/**
 * Switches to a specific chat by contact name
 * @param {string} contactName - Name of the contact to switch to
 * @returns {boolean} - Success status of the operation
 */
function switchToChat(contactName) {
  // Find the chat in the chat list
  const chatElements = document.querySelectorAll(DOM_SELECTORS.CONTACT_NAME);
  for (const element of chatElements) {
    if (element.textContent.trim() === contactName) {
      element.click();
      return true;
    }
  }
  return false;
}

/**
 * Waits for messages to load and extracts them
 * @returns {Promise<Array>} - Array of message objects
 */
function waitForMessages() {
  return new Promise((resolve) => {
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_INTERVAL = 1000;

    function extractMessageContent() {
      const messages = [];
      const messageContainer = document.querySelector(DOM_SELECTORS.MESSAGE_LIST);

      if (!messageContainer) {
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          setTimeout(extractMessageContent, RETRY_INTERVAL);
          return;
        }
        resolve([]);
        return;
      }

      // Extract incoming messages
      const incomingMessages = messageContainer.querySelectorAll(DOM_SELECTORS.MESSAGE_IN);
      incomingMessages.forEach(msg => processMessage(msg, 'incoming', messages));

      // Extract outgoing messages
      const outgoingMessages = messageContainer.querySelectorAll(DOM_SELECTORS.MESSAGE_OUT);
      outgoingMessages.forEach(msg => processMessage(msg, 'outgoing', messages));

      // Sort messages by timestamp
      messages.sort((a, b) => a.timestamp - b.timestamp);
      resolve(messages);
    }

    extractMessageContent();
  });
}

/**
 * Processes a single message element and adds it to the messages array
 * @param {Element} messageElement - The DOM element containing the message
 * @param {string} direction - Message direction ('incoming' or 'outgoing')
 * @param {Array} messages - Array to store processed messages
 */
function processMessage(messageElement, direction, messages) {
  try {
    const textElement = messageElement.querySelector(DOM_SELECTORS.MESSAGE_TEXT);
    const timeElement = messageElement.querySelector(DOM_SELECTORS.MESSAGE_TIME);

    if (textElement && timeElement) {
      const content = textElement.textContent.trim();
      const timeString = timeElement.getAttribute('data-time') || timeElement.textContent;
      
      messages.push({
        content,
        timestamp: new Date(timeString).toISOString(),
        direction,
        type: 'message',
        source: 'dom_extraction'
      });
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

/**
 * Opens a chat with the specified contact
 * @param {string} contactName - Name of the contact to open chat with
 * @returns {Promise<Object>} Result of the operation
 */
async function openChat(contactName) {
  return new Promise(async (resolve) => {
    try {
      // First check if chat is already open
      const currentChat = document.querySelector(DOM_SELECTORS.ACTIVE_CHAT_NAME);
      if (currentChat && currentChat.textContent.trim() === contactName) {
        resolve({ success: true, message: 'Chat already open' });
        return;
      }

      // Try direct chat selection first
      const chatFound = await findAndClickChat(contactName);
      if (chatFound) {
        resolve({ success: true, message: 'Chat opened successfully' });
        return;
      }

      // If direct selection fails, try search
      const searchResult = await searchAndOpenChat(contactName);
      resolve(searchResult);

    } catch (error) {
      console.error('Error opening chat:', error);
      resolve({ 
        success: false, 
        message: 'Failed to open chat',
        error: error.message 
      });
    }
  });
}

/**
 * Attempts to find and click a chat in the visible chat list
 * @param {string} contactName - Name of the contact
 * @returns {Promise<boolean>} Whether chat was found and clicked
 */
async function findAndClickChat(contactName) {
  const chatItems = document.querySelectorAll(DOM_SELECTORS.CHAT_LIST_ITEM);
  
  for (const item of chatItems) {
    const titleElement = item.querySelector(DOM_SELECTORS.CHAT_ITEM_TITLE);
    if (titleElement && titleElement.textContent.trim() === contactName) {
      // Simulate natural click
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300); // Wait for scroll
      
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      item.dispatchEvent(clickEvent);
      
      // Wait for chat to open
      await waitForElement(DOM_SELECTORS.MESSAGE_CONTAINER);
      return true;
    }
  }
  return false;
}

/**
 * Searches for and opens a chat using the search box
 * @param {string} contactName - Name of the contact
 * @returns {Promise<Object>} Result of the operation
 */
async function searchAndOpenChat(contactName) {
  const searchBox = document.querySelector(DOM_SELECTORS.CHAT_SEARCH_BOX);
  if (!searchBox) {
    return { success: false, message: 'Search box not found' };
  }

  try {
    // Clear existing search
    searchBox.value = '';
    searchBox.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);

    // Enter search text
    searchBox.value = contactName;
    searchBox.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(500);

    // Check for no results
    const noResults = document.querySelector(DOM_SELECTORS.NO_CHAT_FOUND);
    if (noResults) {
      // Clear search
      const backButton = document.querySelector(DOM_SELECTORS.SEARCH_BACK_BUTTON);
      if (backButton) backButton.click();
      
      return { 
        success: false, 
        message: 'Contact not found' 
      };
    }

    // Try to find and click the chat
    const found = await findAndClickChat(contactName);
    if (found) {
      return { success: true, message: 'Chat opened via search' };
    }

    return { 
      success: false, 
      message: 'Could not open chat after search' 
    };

  } catch (error) {
    console.error('Error in search process:', error);
    return { 
      success: false, 
      message: 'Search process failed',
      error: error.message 
    };
  }
}

/**
 * Utility function to wait for an element to appear
 * @param {string} selector - DOM selector to wait for
 * @param {number} timeout - Maximum time to wait in ms
 * @returns {Promise<Element>} The found element
 */
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

/**
 * Utility function to add delay
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize when page loads
if (window.location.hostname === 'web.whatsapp.com') {
  console.log('WhatsApp Web detected, initializing monitoring...');
  initializeMonitoring();
  detectAuthentication();
}

// Enhanced message listener
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
    case 'FORCE_DOM_EXTRACTION':
      extractContacts().then(result => {
        sendResponse(result);
      });
      return true; // Required for async response
    case 'EXTRACT_MESSAGES':
      extractMessages(message.chatId).then(result => {
        sendResponse(result);
      });
      return true; // Required for async response
    case 'OPEN_CHAT':
      openChat(message.contactName).then(result => {
        sendResponse(result);
      });
      return true; // Required for async response
    case 'EXTRACT_CONTACTS':
      extractContacts().then(result => {
        sendResponse(result);
      });
      return true; // Required for async response
    case 'START_MESSAGE_MONITORING':
      if (!messageObserver) {
        messageObserver = monitorNewMessages();
      }
      sendResponse({ success: true });
      break;
    case 'STOP_MESSAGE_MONITORING':
      if (messageObserver) {
        messageObserver.disconnect();
        messageObserver = null;
      }
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Cleanup on page unload
let messageObserver = null;
window.addEventListener('unload', () => {
  if (contactCheckInterval) {
    clearInterval(contactCheckInterval);
  }
  if (messageObserver) {
    messageObserver.disconnect();
  }
}); 