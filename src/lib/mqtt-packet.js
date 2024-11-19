// Enhanced MQTT packet parser for WhatsApp Web
export const mqtt = {
  parser: function() {
    return {
      on: function(event, callback) {
        this.callback = callback;
      },
      parse: function(data) {
        try {
          // Convert ArrayBuffer to string if needed
          let messageData = data;
          if (data instanceof ArrayBuffer) {
            messageData = new TextDecoder().decode(data);
          }

          // Attempt to parse as JSON
          let parsedData = {};
          try {
            parsedData = JSON.parse(messageData);
          } catch (e) {
            parsedData = { rawData: messageData };
          }

          // Identify message type and extract relevant information
          const packet = this.processWhatsAppData(parsedData);
          
          if (this.callback) {
            this.callback(packet);
          }
        } catch (error) {
          console.error('Error parsing MQTT packet:', error);
        }
      },

      processWhatsAppData: function(data) {
        // Basic structure for processed packet
        const packet = {
          type: 'unknown',
          timestamp: new Date().toISOString(),
          data: {}
        };

        // Identify message type and extract relevant data
        if (data.type === 'message') {
          packet.type = 'chat_message';
          packet.data = {
            sender: data.sender || 'Unknown',
            content: data.content || '',
            timestamp: data.timestamp || new Date().toISOString()
          };
        } else if (data.type === 'presence') {
          packet.type = 'presence_update';
          packet.data = {
            user: data.user || 'Unknown',
            status: data.status || 'unknown',
            timestamp: data.timestamp || new Date().toISOString()
          };
        } else if (data.type === 'contact') {
          packet.type = 'contact_update';
          packet.data = {
            contactId: data.id || '',
            name: data.name || '',
            status: data.status || '',
            timestamp: data.timestamp || new Date().toISOString()
          };
        }

        return packet;
      }
    };
  }
}; 