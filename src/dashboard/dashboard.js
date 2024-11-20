// Dashboard state management
const dashboardState = {
  messages: [],
  filteredMessages: [],
  currentPage: 1,
  itemsPerPage: 25,
  sortField: 'timestamp',
  sortDirection: 'desc',
  filters: {
    search: '',
    types: new Set(),
    incoming: true,
    outgoing: true,
    dateFrom: null,
    dateTo: null
  }
};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
  // Initialize UI elements
  initializeUIElements();
  
  // Load initial data
  loadDashboardData();
  
  // Setup event listeners
  setupEventListeners();
});

/**
 * Initialize UI elements and references
 */
function initializeUIElements() {
  // Initialize Bootstrap components
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
  
  // Initialize message type chart
  initializeChart();
}

/**
 * Setup event listeners for all interactive elements
 */
function setupEventListeners() {
  // Filter event listeners
  document.getElementById('searchInput').addEventListener('input', handleFilterChange);
  document.getElementById('messageTypeFilter').addEventListener('change', handleFilterChange);
  document.getElementById('incomingFilter').addEventListener('change', handleFilterChange);
  document.getElementById('outgoingFilter').addEventListener('change', handleFilterChange);
  document.getElementById('dateFrom').addEventListener('change', handleFilterChange);
  document.getElementById('dateTo').addEventListener('change', handleFilterChange);

  // Table sorting
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });

  // Export buttons
  document.getElementById('exportJson').addEventListener('click', exportToJson);
  document.getElementById('exportCsv').addEventListener('click', exportToCsv);
  document.getElementById('clearData').addEventListener('click', clearData);
  document.getElementById('refreshData').addEventListener('click', loadDashboardData);
}

/**
 * Load and process dashboard data
 */
async function loadDashboardData() {
  try {
    const data = await chrome.storage.local.get(null);
    dashboardState.messages = Object.values(data)
      .map(item => decryptData(item))
      .filter(item => item && !item.error)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    updateDashboard();
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showError('Failed to load dashboard data');
  }
}

/**
 * Update dashboard with current state
 */
function updateDashboard() {
  applyFilters();
  updateTable();
  updatePagination();
  updateChart();
  updateStats();
}

/**
 * Apply filters to messages
 */
function applyFilters() {
  dashboardState.filteredMessages = dashboardState.messages.filter(message => {
    // Search filter
    if (dashboardState.filters.search) {
      const searchTerm = dashboardState.filters.search.toLowerCase();
      const searchableContent = `${message.sender} ${message.content}`.toLowerCase();
      if (!searchableContent.includes(searchTerm)) return false;
    }

    // Type filter
    if (dashboardState.filters.types.size > 0) {
      if (!dashboardState.filters.types.has(message.type)) return false;
    }

    // Direction filter
    if (!dashboardState.filters.incoming && message.direction === 'incoming') return false;
    if (!dashboardState.filters.outgoing && message.direction === 'outgoing') return false;

    // Date filter
    if (dashboardState.filters.dateFrom) {
      const messageDate = new Date(message.timestamp);
      const fromDate = new Date(dashboardState.filters.dateFrom);
      if (messageDate < fromDate) return false;
    }
    if (dashboardState.filters.dateTo) {
      const messageDate = new Date(message.timestamp);
      const toDate = new Date(dashboardState.filters.dateTo);
      if (messageDate > toDate) return false;
    }

    return true;
  });
}

/**
 * Update message table with current state
 */
function updateTable() {
  const tableBody = document.getElementById('messageTableBody');
  tableBody.innerHTML = '';

  const startIndex = (dashboardState.currentPage - 1) * dashboardState.itemsPerPage;
  const endIndex = startIndex + dashboardState.itemsPerPage;
  const pageMessages = dashboardState.filteredMessages.slice(startIndex, endIndex);

  pageMessages.forEach(message => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatTimestamp(message.timestamp)}</td>
      <td>${formatMessageType(message.type)}</td>
      <td>${escapeHtml(message.sender)}</td>
      <td>${formatMessageContent(message)}</td>
      <td>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-primary" onclick="previewMessage('${message.id}')">
            <i class="bi bi-eye"></i>
          </button>
          <button class="btn btn-outline-secondary" onclick="copyMessage('${message.id}')">
            <i class="bi bi-clipboard"></i>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

/**
 * Format message content based on type
 */
function formatMessageContent(message) {
  switch (message.type) {
    case 'text':
      return `<div class="message-content">${escapeHtml(message.content)}</div>`;
    case 'image':
      return `<div class="message-content">
        <i class="bi bi-image"></i> Image
        ${message.caption ? `<small class="text-muted">${escapeHtml(message.caption)}</small>` : ''}
      </div>`;
    case 'video':
      return `<div class="message-content">
        <i class="bi bi-camera-video"></i> Video
        ${message.caption ? `<small class="text-muted">${escapeHtml(message.caption)}</small>` : ''}
      </div>`;
    case 'audio':
      return `<div class="message-content">
        <i class="bi bi-mic"></i> Audio Message
      </div>`;
    case 'document':
      return `<div class="message-content">
        <i class="bi bi-file-earmark"></i> ${escapeHtml(message.fileName || 'Document')}
      </div>`;
    default:
      return `<div class="message-content text-muted">Unknown message type</div>`;
  }
}

/**
 * Initialize and update chart
 */
function initializeChart() {
  const ctx = document.getElementById('messageTypeChart').getContext('2d');
  dashboardState.chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [
          '#25D366', // WhatsApp green
          '#34B7F1', // WhatsApp blue
          '#ECE5DD', // WhatsApp light
          '#075E54', // WhatsApp dark
          '#128C7E'  // WhatsApp teal
        ]
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

/**
 * Update chart with current data
 */
function updateChart() {
  const messageTypes = {};
  dashboardState.filteredMessages.forEach(message => {
    messageTypes[message.type] = (messageTypes[message.type] || 0) + 1;
  });

  dashboardState.chart.data.labels = Object.keys(messageTypes);
  dashboardState.chart.data.datasets[0].data = Object.values(messageTypes);
  dashboardState.chart.update();
}

/**
 * Update statistics display
 */
function updateStats() {
  const stats = {
    total: dashboardState.filteredMessages.length,
    incoming: dashboardState.filteredMessages.filter(m => m.direction === 'incoming').length,
    outgoing: dashboardState.filteredMessages.filter(m => m.direction === 'outgoing').length
  };

  document.getElementById('messageStats').innerHTML = `
    <div class="d-flex justify-content-between mb-2">
      <span>Total Messages:</span>
      <span class="badge bg-primary">${stats.total}</span>
    </div>
    <div class="d-flex justify-content-between mb-2">
      <span>Incoming:</span>
      <span class="badge bg-success">${stats.incoming}</span>
    </div>
    <div class="d-flex justify-content-between">
      <span>Outgoing:</span>
      <span class="badge bg-info">${stats.outgoing}</span>
    </div>
  `;

  document.getElementById('totalMessages').textContent = `Total Messages: ${stats.total}`;
}

// ... (utility functions remain the same) 