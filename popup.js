document.addEventListener('DOMContentLoaded', () => {
  const positionRadios = document.querySelectorAll('input[name="sidebar-position"]');
  const themeRadios = document.querySelectorAll('input[name="theme"]');
  
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
});
