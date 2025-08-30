document.addEventListener('DOMContentLoaded', () => {
  const positionRadios = document.querySelectorAll('input[name="sidebar-position"]');
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  const saveSessionBtn = document.getElementById('save-session-btn');
  const restoreSessionBtn = document.getElementById('restore-session-btn');
  const sessionInfo = document.getElementById('session-info');
  
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
   * Updates the session info display with saved session details
   */
  function updateSessionInfo() {
    chrome.runtime.sendMessage({ action: 'getSavedSessionInfo' }, (response) => {
      if (response && response.success) {
        const lastSavedDate = new Date(response.lastSaved);
        const formattedDate = lastSavedDate.toLocaleDateString() + ' ' + lastSavedDate.toLocaleTimeString();
        sessionInfo.innerHTML = `
          Last saved: ${formattedDate}<br>
          ${response.totalTabs} tabs in ${response.windowCount} window(s)
        `;
        restoreSessionBtn.disabled = false;
      } else {
        sessionInfo.textContent = 'No saved session found';
        restoreSessionBtn.disabled = true;
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
      saveSessionBtn.textContent = 'Save State';
    });
  }

  /**
   * Handles restore session with confirmation
   */
  function handleRestoreSession() {
    chrome.runtime.sendMessage({ action: 'getSavedSessionInfo' }, (response) => {
      if (response && response.success) {
        const confirmMessage = `This will restore ${response.totalTabs} tabs in ${response.windowCount} new window(s). Continue?`;
        
        if (confirm(confirmMessage)) {
          restoreSessionBtn.disabled = true;
          restoreSessionBtn.textContent = 'Restoring...';
          
          chrome.runtime.sendMessage({ action: 'restoreSession' }, (restoreResponse) => {
            if (restoreResponse && restoreResponse.success) {
              showTemporaryMessage('Session restored successfully!', 'success');
            } else {
              showTemporaryMessage('Failed to restore session: ' + (restoreResponse?.error || 'Unknown error'), 'error');
            }
            
            restoreSessionBtn.disabled = false;
            restoreSessionBtn.textContent = 'Restore Last State';
          });
        }
      } else {
        showTemporaryMessage('No saved session found', 'error');
      }
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

  // Event listeners for session buttons
  saveSessionBtn.addEventListener('click', handleSaveSession);
  restoreSessionBtn.addEventListener('click', handleRestoreSession);

  // Update session info on load
  updateSessionInfo();
});
