document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('searchInput');
  const filterType = document.getElementById('filterType');
  const dataTable = document.getElementById('dataTable').getElementsByTagName('tbody')[0];
  const visualizationContainer = document.getElementById('visualization');
  const exportJsonButton = document.getElementById('exportJson');
  const exportCsvButton = document.getElementById('exportCsv');
  const clearDataButton = document.getElementById('clearData');

  // Sample data for demonstration
  const capturedData = [
    { timestamp: '2023-10-01T12:00:00Z', type: 'type1', endpoint: '/api/endpoint1', data: 'Sample data 1' },
    { timestamp: '2023-10-01T12:05:00Z', type: 'type2', endpoint: '/api/endpoint2', data: 'Sample data 2' },
    // Add more sample data as needed
  ];

  function renderTable(data) {
    dataTable.innerHTML = '';
    data.forEach(item => {
      const row = dataTable.insertRow();
      row.insertCell(0).textContent = item.timestamp;
      row.insertCell(1).textContent = item.type;
      row.insertCell(2).textContent = item.endpoint;
      row.insertCell(3).textContent = item.data;
    });
  }

  function filterAndSearch() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedType = filterType.value;
    const filteredData = capturedData.filter(item => {
      const matchesSearch = item.data.toLowerCase().includes(searchTerm);
      const matchesType = selectedType ? item.type === selectedType : true;
      return matchesSearch && matchesType;
    });
    renderTable(filteredData);
    renderVisualization(filteredData);
  }

  function renderVisualization(data) {
    // Clear previous visualization
    visualizationContainer.innerHTML = '';

    // Create a simple bar chart as an example
    const svg = d3.select(visualizationContainer).append('svg')
      .attr('width', 600)
      .attr('height', 400);

    const xScale = d3.scaleBand()
      .domain(data.map(d => d.type))
      .range([0, 600])
      .padding(0.1);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.data.length)])
      .range([400, 0]);

    svg.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.type))
      .attr('y', d => yScale(d.data.length))
      .attr('width', xScale.bandwidth())
      .attr('height', d => 400 - yScale(d.data.length))
      .attr('fill', 'steelblue');
  }

  function exportToJson(data) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'captured_data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportToCsv(data) {
    const csvRows = [
      ['Timestamp', 'Message Type', 'Endpoint', 'Data'],
      ...data.map(item => [item.timestamp, item.type, item.endpoint, item.data])
    ];
    const csvString = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'captured_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearData() {
    chrome.storage.local.clear(() => {
      console.log('All data cleared');
      alert('All captured data has been cleared.');
    });
  }

  function fetchCapturedData() {
    chrome.storage.local.get(null, (items) => {
      const data = Object.keys(items).map(key => {
        const decryptedData = decryptData(items[key]);
        return decryptedData;
      });
      renderTable(data);
      renderVisualization(data);
    });
  }

  function decryptData(ciphertext) {
    try {
      // Use the same decryption method as background script
      return JSON.parse(atob(ciphertext));
    } catch (error) {
      console.error('Error decrypting data:', error);
      return { error: 'Failed to decrypt data' };
    }
  }

  exportJsonButton.addEventListener('click', () => exportToJson(capturedData));
  exportCsvButton.addEventListener('click', () => exportToCsv(capturedData));
  clearDataButton.addEventListener('click', () => clearData());

  searchInput.addEventListener('input', filterAndSearch);
  filterType.addEventListener('change', filterAndSearch);

  // Initial render
  fetchCapturedData();
}); 