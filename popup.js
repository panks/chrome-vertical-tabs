document.addEventListener('DOMContentLoaded', () => {
  const radios = document.querySelectorAll('input[name="sidebar-position"]');
  
  chrome.storage.local.get('sidebarPosition', (result) => {
    const currentPosition = result.sidebarPosition || 'left'; // Default to left
    radios.forEach(radio => {
      if (radio.value === currentPosition) {
        radio.checked = true;
      }
    });
  });

  radios.forEach(radio => {
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
});
