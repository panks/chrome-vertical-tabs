/*
 * Vertical Tabs Manager - Side Panel Script
 * 
 * Bug Fix: Added debouncing and concurrency control to prevent duplicate tabs
 * from appearing in the sidebar when multiple Chrome tab events fire rapidly
 * (e.g., when clicking on images or performing actions that trigger multiple events).
 * 
 * Key improvements:
 * - Debounced updateTabs() calls to prevent rapid successive executions
 * - Added isUpdating guard to prevent concurrent execution
 * - Enhanced error handling for async operations
 * - Improved safety checks in renderTabs()
 */

const tabsContainer = document.getElementById('tabs-container');
const newGroupBtn = document.getElementById('new-group-btn');

let tabGroups = {
  ungrouped: { name: 'Ungrouped', tabs: [] }
};
let dragSrcEl = null;

// Context menu elements
let contextMenu = null;
let currentTabId = null;

// Variables to prevent duplicate updates and race conditions
let isUpdating = false;
let updateTimeout = null;

/**
 * Creates the custom context menu element
 */
function createContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
  }
  
  contextMenu = document.createElement('div');
  contextMenu.className = 'context-menu';
  contextMenu.style.cssText = `
    position: fixed;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 2px 2px 10px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    padding: 4px 0;
    min-width: 150px;
    display: none;
  `;
  
  const addToNewGroupOption = document.createElement('div');
  addToNewGroupOption.className = 'context-menu-item';
  addToNewGroupOption.textContent = 'Add to New Group';
  addToNewGroupOption.style.cssText = `
    padding: 8px 16px;
    cursor: pointer;
    font-size: 14px;
  `;
  
  // Hover effects
  addToNewGroupOption.addEventListener('mouseenter', () => {
    addToNewGroupOption.style.backgroundColor = '#f0f0f0';
  });
  
  addToNewGroupOption.addEventListener('mouseleave', () => {
    addToNewGroupOption.style.backgroundColor = '';
  });
  
  // Click handler for "Add to New Group"
  addToNewGroupOption.addEventListener('click', () => {
    handleAddToNewGroup();
    hideContextMenu();
  });
  
  contextMenu.appendChild(addToNewGroupOption);
  document.body.appendChild(contextMenu);
}

/**
 * Shows the context menu at the specified coordinates
 */
function showContextMenu(x, y, tabId) {
  if (!contextMenu) {
    createContextMenu();
  }
  
  currentTabId = tabId;
  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.style.display = 'block';
}

/**
 * Hides the context menu
 */
function hideContextMenu() {
  if (contextMenu) {
    contextMenu.style.display = 'none';
  }
  currentTabId = null;
}

/**
 * Handles the "Add to New Group" functionality
 */
async function handleAddToNewGroup() {
  if (!currentTabId) {
    console.error('No tab selected for grouping');
    return;
  }
  
  // Prompt user for group name
  const groupName = prompt('Enter a name for the new group:');
  if (!groupName || groupName.trim() === '') {
    return; // User cancelled or entered empty name
  }
  
  try {
    // Create new group ID
    const newGroupId = `group-${Date.now()}`;
    
    // Send message to background script to update tab group mapping
    const response = await chrome.runtime.sendMessage({
      action: 'addTabToNewGroup',
      tabId: parseInt(currentTabId),
      groupId: newGroupId,
      groupName: groupName.trim()
    });
    
    if (response && response.success) {
      // Trigger an update to sync with the background script changes
      // This will properly move the tab and create the group with the correct name
      debouncedUpdateTabs();
    }
  } catch (error) {
    console.error('Error adding tab to new group:', error);
    alert('Failed to create new group. Please try again.');
  }
}

function renderTabs() {
  // Clear the container to prevent duplicates
  tabsContainer.innerHTML = '';
  
  // Safety check to ensure tabGroups is valid
  if (!tabGroups || typeof tabGroups !== 'object') {
    console.error('Invalid tabGroups data:', tabGroups);
    return;
  }
  
  for (const groupId in tabGroups) {
    const group = tabGroups[groupId];
    
    // Safety check for group data
    if (!group || !Array.isArray(group.tabs)) {
      console.warn('Invalid group data for groupId:', groupId, group);
      continue;
    }
    const groupEl = document.createElement('div');
    groupEl.className = 'tab-group';
    groupEl.dataset.groupId = groupId;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    
    const groupName = document.createElement('span');
    groupName.className = 'group-name';
    groupName.textContent = group.name;
    groupName.contentEditable = (groupId !== 'ungrouped');
    groupName.addEventListener('blur', async (e) => {
      const newName = e.target.textContent;
      if (newName.trim() !== '' && groupId !== 'ungrouped') {
        const oldName = tabGroups[groupId].name;
        tabGroups[groupId].name = newName;
        
        // Sync group name change to background script
        try {
          await chrome.runtime.sendMessage({
            action: 'updateGroupName',
            groupId: groupId,
            groupName: newName.trim()
          });
        } catch (error) {
          console.warn('Failed to update group name in background script:', error);
          // Revert on error
          tabGroups[groupId].name = oldName;
          e.target.textContent = oldName;
        }
      } else {
        e.target.textContent = tabGroups[groupId].name;
      }
    });

    groupHeader.appendChild(groupName);

    if (groupId !== 'ungrouped') {
      const deleteGroupBtn = document.createElement('button');
      deleteGroupBtn.className = 'delete-group-btn';
      deleteGroupBtn.textContent = 'X';
      deleteGroupBtn.title = 'Delete group and close tabs';
      deleteGroupBtn.addEventListener('click', () => {
        const tabsToClose = group.tabs.map(t => t.id);
        chrome.tabs.remove(tabsToClose);
        delete tabGroups[groupId];
        renderTabs();
      });
      groupHeader.appendChild(deleteGroupBtn);
    }
    
    groupEl.appendChild(groupHeader);
    
    const tabList = document.createElement('ul');
    tabList.className = 'tab-list';
    
    group.tabs.forEach(tab => {
      const tabEl = document.createElement('li');
      tabEl.className = 'tab-item';
      tabEl.textContent = tab.title || tab.url;
      tabEl.dataset.tabId = tab.id;
      tabEl.draggable = true;

      if (tab.active) {
        tabEl.classList.add('active');
      }

      tabEl.addEventListener('click', () => {
        chrome.tabs.update(tab.id, { active: true });
        chrome.windows.update(tab.windowId, { focused: true });
      });

      // Add right-click context menu for tabs only
      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, tab.id);
      });

      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-tab-btn';
      closeBtn.textContent = 'X';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.tabs.remove(tab.id);
      });
      tabEl.appendChild(closeBtn);
      
      tabList.appendChild(tabEl);
    });

    groupEl.appendChild(tabList);

    groupEl.addEventListener('dragover', handleDragOver);
    groupEl.addEventListener('drop', handleDrop);
    
    tabsContainer.appendChild(groupEl);
  }

  addDragAndDropHandlers();
}

function handleDragStart(e) {
  dragSrcEl = this;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
  this.classList.add('dragging');
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (dragSrcEl) {
    const droppedOnGroupEl = this.closest('.tab-group');
    const targetGroupId = droppedOnGroupEl.dataset.groupId;
    const tabId = parseInt(dragSrcEl.dataset.tabId);

    // Find and move the tab
    for (const sourceGroupId in tabGroups) {
      const tabIndex = tabGroups[sourceGroupId].tabs.findIndex(t => t.id === tabId);
      if (tabIndex > -1) {
        const [tabToMove] = tabGroups[sourceGroupId].tabs.splice(tabIndex, 1);
        tabGroups[targetGroupId].tabs.push(tabToMove);
        chrome.runtime.sendMessage({ action: 'updateTabGroup', tabId: tabId, newGroupId: targetGroupId });
        break;
      }
    }
    renderTabs();
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
}

function addDragAndDropHandlers() {
  const items = document.querySelectorAll('.tab-item');
  items.forEach(function(item) {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
  });
}

// Debounced version of updateTabs to prevent rapid successive calls
function debouncedUpdateTabs() {
  // Clear any existing timeout
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  
  // Set a new timeout to call updateTabs after a brief delay
  updateTimeout = setTimeout(() => {
    updateTabsInternal();
  }, 100); // 100ms delay to debounce rapid calls
}

async function updateTabsInternal() {
  // Prevent concurrent execution
  if (isUpdating) {
    return;
  }
  
  isUpdating = true;
  
  try {
    const allTabs = await chrome.tabs.query({});
    const currentTabGroups = { ...tabGroups };
    const allTabIds = allTabs.map(t => t.id);

    // Reset tab lists but keep group names
    for (const groupId in tabGroups) {
        tabGroups[groupId].tabs = [];
    }

    // Get tab group map and group names with error handling
    let tabGroupMap = {};
    let groupNames = {};
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getTabGroupMap' });
      tabGroupMap = response?.tabGroupMap || {};
      groupNames = response?.groupNames || {};
    } catch (error) {
      console.warn('Failed to get tab group map:', error);
      // Continue with empty maps as fallback
    }
    
    allTabs.forEach(tab => {
      const groupId = tabGroupMap[tab.id] || 'ungrouped';
      if (!tabGroups[groupId] && groupId !== 'ungrouped') {
          // Create new group with name from background script, or use default
          const groupName = groupNames[groupId] || `Group ${Object.keys(tabGroups).length}`;
          tabGroups[groupId] = { name: groupName, tabs: [] };
      }
      if (tabGroups[groupId]) {
          tabGroups[groupId].tabs.push(tab);
      } else {
          tabGroups.ungrouped.tabs.push(tab);
      }
    });

    // Clean up empty groups
    for (const groupId in tabGroups) {
      if (groupId !== 'ungrouped' && tabGroups[groupId].tabs.length === 0) {
        delete tabGroups[groupId];
      }
    }

    renderTabs();
  } catch (error) {
    console.error('Error updating tabs:', error);
  } finally {
    isUpdating = false;
  }
}

// Legacy function for backward compatibility
function updateTabs() {
  debouncedUpdateTabs();
}


newGroupBtn.addEventListener('click', () => {
  const newGroupId = `group-${Date.now()}`;
  tabGroups[newGroupId] = { name: `Group ${Object.keys(tabGroups).length}`, tabs: [] };
  renderTabs();
});

chrome.tabs.onCreated.addListener(updateTabs);
chrome.tabs.onUpdated.addListener(updateTabs);
chrome.tabs.onRemoved.addListener(updateTabs);
chrome.tabs.onMoved.addListener(updateTabs);
chrome.tabs.onAttached.addListener(updateTabs);
chrome.tabs.onDetached.addListener(updateTabs);
chrome.tabs.onActivated.addListener(updateTabs);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Safety check for message structure
  if (!message || typeof message !== 'object') {
    return;
  }
  
  if (message.action === 'updatePanel') {
    // Use debounced version to prevent rapid updates
    debouncedUpdateTabs();
  }
});


// Initialize theme on load
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

chrome.storage.local.get('theme', (result) => {
  const currentTheme = result.theme || 'light';
  applyTheme(currentTheme);
});

// Listen for theme changes from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateTheme') {
        applyTheme(message.theme);
    }
});


// Initialize context menu and global click handler
createContextMenu();

// Global click handler to hide context menu when clicking elsewhere
document.addEventListener('click', (e) => {
  if (contextMenu && !contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

// Prevent context menu on empty areas of the container
tabsContainer.addEventListener('contextmenu', (e) => {
  // Only allow context menu on tab elements, not empty container areas
  if (!e.target.closest('.tab-item')) {
    e.preventDefault();
  }
});

updateTabs();
