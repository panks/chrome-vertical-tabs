document.addEventListener('DOMContentLoaded', () => {
  const positionRadios = document.querySelectorAll('input[name="sidebar-position"]');
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  const saveSessionBtn = document.getElementById('save-session-btn');
  const restoreSessionBtn = document.getElementById('restore-session-btn');
  const sessionSelect = document.getElementById('session-select');
  const sessionInfo = document.getElementById('session-info');
  const maxSessionsInput = document.getElementById('max-sessions');
  const saveConfigBtn = document.getElementById('save-config-btn');
  
  chrome.storage.local.get(['sidebarPosition', 'theme'], (result) => {
    const currentPosition = result.sidebarPosition || 'left'; // Default to left
    positionRadios.forEach(radio => {
      if (radio.value === currentPosition) {
        radio.checked = true;
      }
    });

    const currentTheme = result.theme || 'light'; // Default to light
    themeRadios.forEach(radio => {
      if (radio.value === currentTheme) {
        radio.checked = true;
      }
    });
  });

  positionRadios.forEach(radio => {
    radio.addEventListener('change', (event) => {
      const newPosition = event.target.value;
      chrome.storage.local.set({ sidebarPosition: newPosition });
      // The side panel API does not currently support dynamically changing the side.
      // This setting would be applied on the next browser start or extension reload.
      // A note to the user might be helpful here.
      const settingsContainer = document.querySelector('.settings-container');
      let note = document.getElementById('restart-note');
      if (!note) {
          note = document.createElement('p');
          note.id = 'restart-note';
          note.textContent = 'Please reload your browser to see the change.';
          note.style.color = '#888';
          settingsContainer.appendChild(note);
      }
    });
  });

  themeRadios.forEach(radio => {
    radio.addEventListener('change', (event) => {
      const newTheme = event.target.value;
      chrome.storage.local.set({ theme: newTheme });
      chrome.runtime.sendMessage({ action: 'updateTheme', theme: newTheme });
    });
  });

  // Session management functionality
  
  /**
   * Formats a timestamp as a relative time string
   */
  function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }

  /**
   * Updates the session dropdown and info display
   */
  function updateSessionInfo() {
    chrome.runtime.sendMessage({ action: 'getStoredSessions' }, (response) => {
      // Clear existing options
      sessionSelect.innerHTML = '<option value="">Select a session...</option>';
      
      if (response && response.success && response.sessions.length > 0) {
        response.sessions.forEach(session => {
          const option = document.createElement('option');
          option.value = session.id;
          const relativeTime = formatRelativeTime(session.timestamp);
          option.textContent = `${relativeTime} - ${session.totalTabs} tabs, ${session.windowCount} window${session.windowCount > 1 ? 's' : ''}`;
          sessionSelect.appendChild(option);
        });
        
        sessionInfo.textContent = `${response.sessions.length} session${response.sessions.length > 1 ? 's' : ''} available`;
      } else {
        sessionInfo.textContent = 'No saved sessions found';
      }
      
      // Update restore button state
      updateRestoreButtonState();
    });
  }

  /**
   * Updates the restore button state based on selection
   */
  function updateRestoreButtonState() {
    restoreSessionBtn.disabled = !sessionSelect.value;
  }

  /**
   * Loads and displays the session configuration
   */
  function loadSessionConfig() {
    chrome.runtime.sendMessage({ action: 'getSessionConfig' }, (response) => {
      if (response && response.success) {
        maxSessionsInput.value = response.config.maxSessions;
      }
    });
  }

  /**
   * Handles manual save session
   */
  function handleSaveSession() {
    saveSessionBtn.disabled = true;
    saveSessionBtn.textContent = 'Saving...';
    
    chrome.runtime.sendMessage({ action: 'saveSession' }, (response) => {
      if (response && response.success) {
        updateSessionInfo();
        showTemporaryMessage('Session saved successfully!', 'success');
      } else {
        showTemporaryMessage('Failed to save session: ' + (response?.error || 'Unknown error'), 'error');
      }
      
      saveSessionBtn.disabled = false;
      saveSessionBtn.textContent = 'Save Current State';
    });
  }

  /**
   * Handles restore session with confirmation
   */
  function handleRestoreSession() {
    const selectedSessionId = sessionSelect.value;
    if (!selectedSessionId) {
      showTemporaryMessage('Please select a session to restore', 'error');
      return;
    }

    // Get session details for confirmation
    chrome.runtime.sendMessage({ action: 'getStoredSessions' }, (response) => {
      if (response && response.success) {
        const selectedSession = response.sessions.find(s => s.id === selectedSessionId);
        if (selectedSession) {
          const confirmMessage = `This will restore ${selectedSession.totalTabs} tabs in ${selectedSession.windowCount} new window(s). Continue?`;
          
          if (confirm(confirmMessage)) {
            restoreSessionBtn.disabled = true;
            restoreSessionBtn.textContent = 'Restoring...';
            
            chrome.runtime.sendMessage({ 
              action: 'restoreSession',
              sessionId: selectedSessionId
            }, (restoreResponse) => {
              if (restoreResponse && restoreResponse.success) {
                showTemporaryMessage('Session restored successfully!', 'success');
              } else {
                showTemporaryMessage('Failed to restore session: ' + (restoreResponse?.error || 'Unknown error'), 'error');
              }
              
              restoreSessionBtn.disabled = false;
              restoreSessionBtn.textContent = 'Restore Selected';
            });
          }
        }
      }
    });
  }

  /**
   * Handles saving session configuration
   */
  function handleSaveConfig() {
    const maxSessions = parseInt(maxSessionsInput.value);
    if (isNaN(maxSessions) || maxSessions < 1 || maxSessions > 10) {
      showTemporaryMessage('Please enter a valid number between 1 and 10', 'error');
      return;
    }

    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = 'Saving...';
    
    chrome.runtime.sendMessage({ 
      action: 'updateSessionConfig',
      config: { maxSessions }
    }, (response) => {
      if (response && response.success) {
        showTemporaryMessage('Configuration saved successfully!', 'success');
        updateSessionInfo(); // Refresh session list in case sessions were trimmed
      } else {
        showTemporaryMessage('Failed to save configuration: ' + (response?.error || 'Unknown error'), 'error');
      }
      
      saveConfigBtn.disabled = false;
      saveConfigBtn.textContent = 'Save';
    });
  }

  /**
   * Shows a temporary message to the user
   */
  function showTemporaryMessage(message, type) {
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1000;
      ${type === 'success' ? 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;' : 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;'}
    `;
    messageEl.textContent = message;
    document.body.appendChild(messageEl);
    
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl);
      }
    }, 3000);
  }

  // Event listeners for session controls
  saveSessionBtn.addEventListener('click', handleSaveSession);
  restoreSessionBtn.addEventListener('click', handleRestoreSession);
  sessionSelect.addEventListener('change', updateRestoreButtonState);
  saveConfigBtn.addEventListener('click', handleSaveConfig);

  // Initialize session management on load
  loadSessionConfig();
  updateSessionInfo();
});
