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
      this.pageSize = 20;
      this.currentPage = 0;
      this.observer = new IntersectionObserver(
        (entries) => this.handleIntersection(entries),
        { root: container, threshold: 0.1 }
      );

      // Add scroll listener for infinite scrolling
      this.container.addEventListener('scroll', () => {
        if (this.container.scrollHeight - this.container.scrollTop <= this.container.clientHeight + 100) {
          this.loadMoreItems();
        }
      });
    }

    async loadMoreItems() {
      if (this.isLoading) return;
      this.isLoading = true;

      try {
        const items = await this.fetchPagedData(this.currentPage, this.pageSize);
        items.forEach(item => this.addItem(item, false));
        this.currentPage++;
      } catch (error) {
        console.error('Error loading more items:', error);
      } finally {
        this.isLoading = false;
      }
    }

    async fetchPagedData(page, pageSize) {
      return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
          const allData = Object.keys(items)
            .filter(key => key.startsWith('data_'))
            .map(key => {
              try {
                return JSON.parse(atob(items[key]));
              } catch (error) {
                console.error('Error decoding data:', error);
                return null;
              }
            })
            .filter(item => item !== null)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

          const start = page * pageSize;
          const end = start + pageSize;
          resolve(allData.slice(start, end));
        });
      });
    }

    handleIntersection(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('highlight');
          setTimeout(() => {
            entry.target.classList.remove('highlight');
          }, 2000);
        }
      });
    }

    addItem(data, prepend = true) {
      const item = createActivityItem(data);
      if (prepend) {
        this.container.insertBefore(item, this.container.firstChild);
      } else {
        this.container.appendChild(item);
      }
      this.items.set(data.timestamp, item);
      this.observer.observe(item);
      return item;
    }

    updateItems(newData) {
      const currentItems = new Set(this.items.keys());
      
      newData.forEach(data => {
        if (!currentItems.has(data.timestamp)) {
          this.addItem(data, true);
        }
      });

      // Remove old items if exceeding limit
      while (this.items.size > 50) {
        const oldestKey = Array.from(this.items.keys())[0];
        const oldestItem = this.items.get(oldestKey);
        this.observer.unobserve(oldestItem);
        oldestItem.remove();
        this.items.delete(oldestKey);
      }
    }

    clear() {
      this.items.forEach((item, key) => {
        this.observer.unobserve(item);
        item.remove();
      });
      this.items.clear();
    }
  }

  const listManager = new ActivityListManager(activityList);

  // Throttled update function
  const throttledUpdate = () => {
    const now = Date.now();
    if (now - lastUpdateTime >= UPDATE_THROTTLE) {
      updateActivityList();
      lastUpdateTime = now;
    } else {
      clearTimeout(window.updateTimeout);
      window.updateTimeout = setTimeout(throttledUpdate, UPDATE_THROTTLE);
    }
  };

  // Enhanced update function
  function updateActivityList() {
    if (isUpdatesPaused) {
      newDataBadge.classList.remove('hidden');
      return;
    }

    chrome.storage.local.get(null, (items) => {
      const newData = Object.keys(items)
        .filter(key => key.startsWith('data_'))
        .map(key => {
          try {
            return JSON.parse(atob(items[key]));
          } catch (error) {
            console.error('Error decoding data:', error);
            return null;
          }
        })
        .filter(item => item !== null)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      listManager.updateItems(newData);
      captureCount.textContent = `Captured: ${newData.length} items`;
      newDataBadge.classList.add('hidden');
    });
  }

  // Toggle updates
  pauseUpdatesButton.addEventListener('click', () => {
    isUpdatesPaused = !isUpdatesPaused;
    pauseUpdatesButton.textContent = isUpdatesPaused ? 'Resume Updates' : 'Pause Updates';
    liveIndicator.classList.toggle('paused', isUpdatesPaused);
    
    if (!isUpdatesPaused) {
      updateActivityList();
    }
  });

  // Enhanced storage change listener
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && document.visibilityState === 'visible') {
      throttledUpdate();
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
}); 