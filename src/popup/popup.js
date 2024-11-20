document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggleInspect');
  const statusText = document.getElementById('statusText');
  const activityList = document.getElementById('activityList');
  const captureCount = document.getElementById('captureCount');
  const clearDataButton = document.getElementById('clearData');
  const openDashboardButton = document.getElementById('openDashboard');
  const pauseUpdatesButton = document.getElementById('pauseUpdates');
  const newDataBadge = document.getElementById('newDataBadge');
  const liveIndicator = document.getElementById('liveIndicator');

  let activityData = [];
  let isUpdatesPaused = false;
  let pendingUpdates = [];
  let lastUpdateTime = Date.now();
  const UPDATE_THROTTLE = 500; // Minimum time between updates in ms

  // Enhanced activity list management
  class ActivityListManager {
    constructor(container) {
      this.container = container;
      this.items = new Map();
      this.virtualItems = [];
      this.visibleItems = new Map();
      
      // Virtual scrolling configuration
      this.itemHeight = 80; // Estimated height of each item in pixels
      this.bufferSize = 5; // Number of items to render above/below viewport
      this.visibleRange = { start: 0, end: 0 };
      
      // Initialize container for virtual scrolling
      this.container.style.position = 'relative';
      this.container.style.height = '400px'; // Fixed height for scroll container
      this.heightHolder = document.createElement('div');
      this.container.appendChild(this.heightHolder);

      // Throttled scroll handler
      this.scrollHandler = this.throttle(() => this.updateVisibleItems(), 16);
      this.container.addEventListener('scroll', this.scrollHandler);

      // Intersection observer for animations
      this.observer = new IntersectionObserver(
        (entries) => this.handleIntersection(entries),
        { root: container, threshold: 0.1 }
      );

      // Initialize ResizeObserver for container size changes
      this.resizeObserver = new ResizeObserver(() => this.updateVisibleItems());
      this.resizeObserver.observe(container);
    }

    /**
     * Updates the popup UI with new captured data
     * @param {Array|Object} data - New data to display
     */
    updatePopupUI(data) {
      try {
        const dataArray = Array.isArray(data) ? data : [data];
        
        // Add new items to virtual list
        dataArray.forEach(item => {
          this.virtualItems.unshift({
            ...item,
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          });
        });

        // Update total height of container
        this.updateTotalHeight();

        // Update visible items
        this.updateVisibleItems();

        // Show notification badge
        this.showNewDataNotification(dataArray.length);

        // Cleanup old items if needed
        this.cleanupOldItems();
      } catch (error) {
        console.error('Error updating popup UI:', error);
      }
    }

    /**
     * Updates which items are currently visible
     */
    updateVisibleItems() {
      const scrollTop = this.container.scrollTop;
      const containerHeight = this.container.clientHeight;
      
      // Calculate visible range
      const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.bufferSize);
      const endIndex = Math.min(
        this.virtualItems.length,
        Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.bufferSize
      );

      // Update visible range
      this.visibleRange = { start: startIndex, end: endIndex };

      // Get currently visible items
      const newVisibleItems = new Map();
      for (let i = startIndex; i < endIndex; i++) {
        const item = this.virtualItems[i];
        if (!item) continue;

        if (this.visibleItems.has(item.id)) {
          // Reuse existing element
          newVisibleItems.set(item.id, this.visibleItems.get(item.id));
          this.visibleItems.delete(item.id);
        } else {
          // Create new element
          const element = this.createActivityElement(item);
          if (element) {
            element.style.position = 'absolute';
            element.style.top = `${i * this.itemHeight}px`;
            element.style.width = '100%';
            this.container.appendChild(element);
            newVisibleItems.set(item.id, element);
          }
        }
      }

      // Remove no-longer-visible items
      this.visibleItems.forEach((element) => {
        element.remove();
      });

      this.visibleItems = newVisibleItems;
      this.updateCounter();
    }

    /**
     * Updates the total height of the scroll container
     */
    updateTotalHeight() {
      const totalHeight = this.virtualItems.length * this.itemHeight;
      this.heightHolder.style.height = `${totalHeight}px`;
    }

    /**
     * Shows notification for new data
     * @param {number} count - Number of new items
     */
    showNewDataNotification(count) {
      const badge = document.getElementById('newDataBadge');
      if (badge) {
        badge.textContent = `${count} new`;
        badge.classList.remove('hidden');
        
        // Clear notification when user scrolls to top
        if (this.container.scrollTop < this.itemHeight) {
          setTimeout(() => badge.classList.add('hidden'), 2000);
        }
      }

      // Update live indicator
      const liveIndicator = document.getElementById('liveIndicator');
      if (liveIndicator) {
        liveIndicator.classList.add('active');
        setTimeout(() => liveIndicator.classList.remove('active'), 1000);
      }
    }

    /**
     * Throttle function for scroll handling
     */
    throttle(func, limit) {
      let inThrottle;
      return function(...args) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }

    /**
     * Creates an activity element from data
     * @param {Object} data - Activity data
     * @returns {HTMLElement} Created element
     */
    createActivityElement(data) {
      try {
        const element = document.createElement('div');
        element.className = 'activity-item new';
        
        // Format based on data type
        const content = this.formatActivityContent(data);
        element.innerHTML = `
          <div class="activity-header">
            <span class="activity-type">${data.type || 'unknown'}</span>
            <span class="activity-time">${this.formatTime(data.timestamp)}</span>
            <span class="activity-source">${data.source || 'unknown'}</span>
          </div>
          <div class="activity-content">${content}</div>
        `;

        // Observe for animations
        this.observer.observe(element);
        
        return element;
      } catch (error) {
        console.error('Error creating activity element:', error);
        return null;
      }
    }

    /**
     * Formats activity content based on type
     * @param {Object} data - Activity data
     * @returns {string} Formatted content
     */
    formatActivityContent(data) {
      switch (data.type) {
        case 'message':
          return `
            <div class="message ${data.direction || 'unknown'}">
              <span class="message-sender">${data.sender || 'Unknown'}</span>
              <span class="message-content">${this.escapeHtml(data.content)}</span>
            </div>
          `;
        case 'contact':
          return `
            <div class="contact-update">
              <span class="contact-name">${data.name || 'Unknown Contact'}</span>
              <span class="contact-status">${data.status || ''}</span>
            </div>
          `;
        default:
          return `<div class="generic-content">${JSON.stringify(data.data || {})}</div>`;
      }
    }

    /**
     * Updates the capture counter
     */
    updateCounter() {
      const counter = document.getElementById('captureCount');
      if (counter) {
        counter.textContent = `Captured: ${this.items.size} items`;
      }
    }

    /**
     * Animates new items
     * @param {number} count - Number of new items
     */
    animateNewItems(count) {
      const newItems = Array.from(this.container.children)
        .slice(0, count)
        .filter(item => item.classList.contains('new'));

      newItems.forEach((item, index) => {
        // Stagger animations
        setTimeout(() => {
          item.classList.add('slide-in');
          setTimeout(() => {
            item.classList.remove('new', 'slide-in');
          }, 500);
        }, index * 100);
      });

      // Show new data badge
      const badge = document.getElementById('newDataBadge');
      if (badge) {
        badge.classList.remove('hidden');
        setTimeout(() => badge.classList.add('hidden'), 2000);
      }
    }

    /**
     * Cleans up old items to maintain performance
     */
    async cleanupOldItems() {
      const maxItems = 100; // Maximum items to keep in view
      if (this.items.size > maxItems) {
        const itemsToRemove = Array.from(this.items.entries())
          .slice(maxItems)
          .map(([timestamp, element]) => {
            this.observer.unobserve(element);
            element.remove();
            return timestamp;
          });

        itemsToRemove.forEach(timestamp => this.items.delete(timestamp));
      }
    }

    /**
     * Utility function to escape HTML
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    /**
     * Formats timestamp for display
     * @param {string} timestamp - ISO timestamp
     * @returns {string} Formatted time
     */
    formatTime(timestamp) {
      try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
      } catch (error) {
        return 'Invalid time';
      }
    }

    /**
     * Cleanup when destroying the manager
     */
    destroy() {
      this.container.removeEventListener('scroll', this.scrollHandler);
      this.resizeObserver.disconnect();
      this.observer.disconnect();
    }
  }

  // Initialize activity list manager
  const listManager = new ActivityListManager(document.getElementById('activityList'));

  // Update storage change listener to use new manager
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && !isUpdatesPaused) {
      Object.values(changes).forEach(change => {
        try {
          const newData = JSON.parse(atob(change.newValue));
          listManager.updatePopupUI(newData);
        } catch (error) {
          console.error('Error processing storage change:', error);
        }
      });
    }
  });

  // Toggle updates
  pauseUpdatesButton.addEventListener('click', () => {
    isUpdatesPaused = !isUpdatesPaused;
    pauseUpdatesButton.textContent = isUpdatesPaused ? 'Resume Updates' : 'Pause Updates';
    liveIndicator.classList.toggle('paused', isUpdatesPaused);
    
    if (!isUpdatesPaused) {
      updateActivityList();
    }
  });

  // Visibility change handler
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !isUpdatesPaused) {
      updateActivityList();
    }
  });

  // Clear data handler
  clearDataButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all captured data?')) {
      chrome.storage.local.clear(() => {
        listManager.clear();
        captureCount.textContent = 'Captured: 0 items';
      });
    }
  });

  // Check current state and update UI
  chrome.storage.local.get(['isEnabled'], function(result) {
    updateUI(result.isEnabled);
  });

  // Toggle button click handler
  toggleButton.addEventListener('click', function() {
    chrome.storage.local.get(['isEnabled'], function(result) {
      const newState = !result.isEnabled;
      chrome.storage.local.set({ isEnabled: newState }, function() {
        updateUI(newState);
      });
    });
  });

  // Open dashboard button click handler
  openDashboardButton.addEventListener('click', function() {
    chrome.tabs.create({ url: 'src/dashboard/dashboard.html' });
  });

  // Function to update UI state
  function updateUI(isEnabled) {
    toggleButton.textContent = isEnabled ? 'Stop Inspection' : 'Start Inspection';
    statusText.textContent = `Status: ${isEnabled ? 'Active' : 'Inactive'}`;
    toggleButton.style.backgroundColor = isEnabled ? '#DC3545' : '#128C7E';
  }

  // Listen for authentication detection
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTHENTICATION_DETECTED') {
      updateUI(true);
      console.log('UI updated for authentication detection');
    }
  });

  // Initial update
  updateActivityList();

  // Add storage configuration management
  function updateStorageConfig() {
    const configDialog = document.createElement('dialog');
    configDialog.innerHTML = `
      <form method="dialog">
        <h3>Storage Settings</h3>
        <div>
          <label>Maximum Items:
            <input type="number" id="maxItems" min="100" max="10000">
          </label>
        </div>
        <div>
          <label>Retention Days:
            <input type="number" id="retentionDays" min="1" max="30">
          </label>
        </div>
        <div>
          <button type="submit">Save</button>
          <button type="button" onclick="this.closest('dialog').close()">Cancel</button>
        </div>
      </form>
    `;

    chrome.storage.local.get('storageConfig', (result) => {
      configDialog.querySelector('#maxItems').value = result.storageConfig.maxItems;
      configDialog.querySelector('#retentionDays').value = result.storageConfig.retentionDays;
    });

    configDialog.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const newConfig = {
        maxItems: parseInt(configDialog.querySelector('#maxItems').value),
        retentionDays: parseInt(configDialog.querySelector('#retentionDays').value)
      };
      chrome.runtime.sendMessage({ 
        type: 'UPDATE_STORAGE_CONFIG', 
        config: newConfig 
      });
      configDialog.close();
    });

    document.body.appendChild(configDialog);
    configDialog.showModal();
  }

  // Add storage management button
  const storageSettingsButton = document.createElement('button');
  storageSettingsButton.textContent = 'Storage Settings';
  storageSettingsButton.className = 'small-button';
  document.querySelector('.footer-controls').appendChild(storageSettingsButton);

  storageSettingsButton.addEventListener('click', updateStorageConfig);

  // Update CSS classes for virtual scrolling
  const style = document.createElement('style');
  style.textContent = `
    .activity-item {
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
      opacity: 0;
      transform: translateY(-20px);
    }

    .activity-item.visible {
      opacity: 1;
      transform: translateY(0);
    }

    #activityList {
      overflow-y: auto;
      position: relative;
      height: 400px;
      scroll-behavior: smooth;
    }

    .live-indicator.active {
      animation: pulse 1s ease-out;
    }

    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}); 