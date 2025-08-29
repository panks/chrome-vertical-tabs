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
let groupOrder = ['ungrouped'];
let dragSrcEl = null;
let selectedTabs = new Set();
let isDragging = false;
let isSidePanelInteracting = false; // Flag to track user interaction within the side panel

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
  contextMenu.style.position = 'fixed';
  contextMenu.style.zIndex = '1000';
  contextMenu.style.display = 'none';

  const addToNewGroupOption = document.createElement('div');
  addToNewGroupOption.className = 'context-menu-item';
  addToNewGroupOption.textContent = 'Add to New Group';

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

  try {
    const newGroupId = `group-${Date.now()}`;
    const groupName = 'New Group';

    const response = await chrome.runtime.sendMessage({
      action: 'addTabToNewGroup',
      tabId: parseInt(currentTabId),
      groupId: newGroupId,
      groupName: groupName
    });

    if (response && response.success) {
      await debouncedUpdateTabs();
      
      const groupEl = document.querySelector(`.tab-group[data-group-id="${newGroupId}"]`);
      if (groupEl) {
        const groupNameEl = groupEl.querySelector('.group-name');
        if (groupNameEl) {
          groupNameEl.focus();
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(groupNameEl);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
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
  
  for (const groupId of groupOrder) {
    if (!tabGroups[groupId]) continue;
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
    
    const groupHeaderLeft = document.createElement('div');
    groupHeaderLeft.className = 'group-header-left';

    if (groupId !== 'ungrouped') {
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'collapse-btn';
      collapseBtn.textContent = group.collapsed ? '+' : '-';
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        group.collapsed = !group.collapsed;
        renderTabs();
      });
      groupHeaderLeft.appendChild(collapseBtn);
    }
    
    const groupName = document.createElement('span');
    groupName.className = 'group-name';
    groupName.textContent = group.name;
    groupName.contentEditable = (groupId !== 'ungrouped');
    groupName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.target.blur();
        }
    });
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

    groupHeaderLeft.appendChild(groupName);
    groupHeader.appendChild(groupHeaderLeft);

    if (groupId !== 'ungrouped') {
      const groupControls = document.createElement('div');
      groupControls.className = 'group-controls';

      const upBtn = document.createElement('button');
      upBtn.className = 'move-group-btn';
      upBtn.innerHTML = '&#9650;'; // Up arrow
      upBtn.title = 'Move group up';
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveGroup(groupId, 'up');
      });

      const downBtn = document.createElement('button');
      downBtn.className = 'move-group-btn';
      downBtn.innerHTML = '&#9660;'; // Down arrow
      downBtn.title = 'Move group down';
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveGroup(groupId, 'down');
      });

      const groupedOrder = groupOrder.filter(id => id !== 'ungrouped');
      const groupIndex = groupedOrder.indexOf(groupId);
      if (groupIndex === 0) upBtn.disabled = true;
      if (groupIndex === groupedOrder.length - 1) downBtn.disabled = true;

      groupControls.appendChild(upBtn);
      groupControls.appendChild(downBtn);

      const deleteGroupBtn = document.createElement('button');
      deleteGroupBtn.className = 'delete-group-btn';
      deleteGroupBtn.textContent = 'X';
      deleteGroupBtn.title = 'Delete group and close tabs';
      deleteGroupBtn.addEventListener('click', async () => {
        const tabsToClose = group.tabs.map(t => t.id);
        if (tabsToClose.length > 0) {
          chrome.tabs.remove(tabsToClose);
        }
        
        try {
          await chrome.runtime.sendMessage({
            action: 'deleteGroup',
            groupId: groupId
          });
        } catch (error) {
          console.error('Error deleting group:', error);
        }
        
        delete tabGroups[groupId];
        const orderIndex = groupOrder.indexOf(groupId);
        if (orderIndex > -1) {
          groupOrder.splice(orderIndex, 1);
        }
        renderTabs();
      });
      groupControls.appendChild(deleteGroupBtn);
      groupHeader.appendChild(groupControls);
    }
    
    groupEl.appendChild(groupHeader);
    
    if (!group.collapsed) {
      const tabList = document.createElement('ul');
      tabList.className = 'tab-list';
      
      group.tabs.forEach(tab => {
        const tabEl = document.createElement('li');
        tabEl.className = 'tab-item';
        tabEl.dataset.tabId = tab.id;
        tabEl.draggable = true;

        const favicon = document.createElement('img');
        favicon.className = 'favicon';
        favicon.src = tab.favIconUrl || 'icons/icon16.png';
        tabEl.appendChild(favicon);

        const title = document.createElement('span');
        title.className = 'tab-title';
        title.textContent = tab.title || tab.url;
        tabEl.appendChild(title);

        if (tab.active) {
          tabEl.classList.add('active');
        }
        if (selectedTabs.has(tab.id)) {
          tabEl.classList.add('selected');
        }

        tabEl.addEventListener('mousedown', (e) => {
          if (e.target.classList.contains('close-tab-btn')) return;

          isSidePanelInteracting = true;
          // Immediately activate tab on mousedown for responsiveness.
          if (!e.shiftKey && e.button === 0) {
            chrome.tabs.update(tab.id, { active: true });
            chrome.windows.update(tab.windowId, { focused: true });
          }
        });

        tabEl.addEventListener('mouseup', (e) => {
          if (e.target.classList.contains('close-tab-btn')) return;

          // Reset the flag after the event cycle, so onActivated can see it first.
          setTimeout(() => { isSidePanelInteracting = false; }, 0);
          
          if (e.shiftKey || e.button !== 0) return;

          // If a drag operation is in progress, don't treat this as a click.
          if (isDragging) {
            return;
          }

          // This is a normal click/mouseup. Set the selection.
          selectedTabs.clear();
          selectedTabs.add(tab.id);
          renderTabs();
        });

        tabEl.addEventListener('click', (e) => {
          // This handler is now only for shift-clicks to toggle selection.
          if (e.shiftKey) {
            e.preventDefault();
            if (selectedTabs.has(tab.id)) {
              selectedTabs.delete(tab.id);
            } else {
              selectedTabs.add(tab.id);
            }
            renderTabs();
          }
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
    }

    groupEl.addEventListener('dragover', handleDragOver);
    groupEl.addEventListener('drop', handleDrop);
    
    tabsContainer.appendChild(groupEl);
  }

  addDragAndDropHandlers();
}

function moveGroup(groupId, direction) {
  const index = groupOrder.indexOf(groupId);

  if (direction === 'up' && index > 1) {
    [groupOrder[index], groupOrder[index - 1]] = [groupOrder[index - 1], groupOrder[index]];
    renderTabs();
  } else if (direction === 'down' && index > 0 && index < groupOrder.length - 1) {
    [groupOrder[index], groupOrder[index + 1]] = [groupOrder[index + 1], groupOrder[index]];
    renderTabs();
  }
}

function handleDragStart(e) {
  isSidePanelInteracting = true;
  isDragging = true;
  const tabId = parseInt(this.dataset.tabId);
  if (!selectedTabs.has(tabId)) {
    selectedTabs.clear();
    selectedTabs.add(tabId);
    // No direct re-render here, but the drop logic will use the updated selectedTabs
  }

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('application/json', JSON.stringify(Array.from(selectedTabs)));

  selectedTabs.forEach(id => {
    const el = document.querySelector(`.tab-item[data-tab-id="${id}"]`);
    if (el) el.classList.add('dragging');
  });
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
  
  const droppedOnGroupEl = this.closest('.tab-group');
  if (!droppedOnGroupEl) return false;

  const targetGroupId = droppedOnGroupEl.dataset.groupId;
  const tabIdsToMove = JSON.parse(e.dataTransfer.getData('application/json'));

  if (!Array.isArray(tabIdsToMove) || tabIdsToMove.length === 0) {
    return false;
  }

  const tabsMoved = [];

  // Remove tabs from their source groups
  for (const sourceGroupId in tabGroups) {
    const sourceGroup = tabGroups[sourceGroupId];
    const tabsToKeep = [];
    for (const tab of sourceGroup.tabs) {
      if (tabIdsToMove.includes(tab.id)) {
        tabsMoved.push(tab);
        chrome.runtime.sendMessage({ action: 'updateTabGroup', tabId: tab.id, newGroupId: targetGroupId });
      } else {
        tabsToKeep.push(tab);
      }
    }
    sourceGroup.tabs = tabsToKeep;
  }

  // Add tabs to the target group and sort them
  const targetTabs = tabGroups[targetGroupId].tabs;
  tabsMoved.forEach(tabToMove => {
    targetTabs.push(tabToMove);
  });
  targetTabs.sort((a, b) => {
    if (a.windowId !== b.windowId) {
      return a.windowId - b.windowId;
    }
    return a.index - b.index;
  });

  renderTabs();
  return false;
}

function handleDragEnd(e) {
  isDragging = false;
  setTimeout(() => { isSidePanelInteracting = false; }, 0); // Also reset here

  const items = document.querySelectorAll('.tab-item');
  items.forEach(function(item) {
    item.classList.remove('dragging');
  });
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
  return new Promise((resolve) => {
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
    
    updateTimeout = setTimeout(async () => {
      await updateTabsInternal();
      resolve();
    }, 100);
  });
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
          tabGroups[groupId] = { name: groupName, tabs: [], collapsed: false };
          if (!groupOrder.includes(groupId)) {
            groupOrder.push(groupId);
          }
      }
      if (tabGroups[groupId]) {
          tabGroups[groupId].tabs.push(tab);
      } else {
          tabGroups.ungrouped.tabs.push(tab);
      }
    });

    // Ensure all groups from groupNames are present, even if empty
    for (const groupId in groupNames) {
        if (!tabGroups[groupId] && groupId !== 'ungrouped') {
            tabGroups[groupId] = { name: groupNames[groupId], tabs: [], collapsed: false };
            if (!groupOrder.includes(groupId)) {
              groupOrder.push(groupId);
            }
        }
    }

    // Clean up empty groups that are not in groupNames anymore
    for (const groupId in tabGroups) {
      if (groupId !== 'ungrouped' && !groupNames[groupId] && tabGroups[groupId].tabs.length === 0) {
        delete tabGroups[groupId];
        const orderIndex = groupOrder.indexOf(groupId);
        if (orderIndex > -1) {
          groupOrder.splice(orderIndex, 1);
        }
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

async function handleTabActivation(activeInfo) {
  if (isSidePanelInteracting) {
    // If interaction is happening inside the side panel, the selection is managed
    // by the tab's own event handlers. We just need to re-render for styling.
    await debouncedUpdateTabs();
    return;
  }

  // If the activation came from outside, sync the selection to the active tab.
  selectedTabs.clear();
  selectedTabs.add(activeInfo.tabId);
  await debouncedUpdateTabs();
}


newGroupBtn.addEventListener('click', async () => {
  const newGroupId = `group-${Date.now()}`;
  const groupName = 'New Group';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'createGroup',
      groupId: newGroupId,
      groupName: groupName
    });

    if (response && response.success) {
      await debouncedUpdateTabs();

      const groupEl = document.querySelector(`.tab-group[data-group-id="${newGroupId}"]`);
      if (groupEl) {
        const groupNameEl = groupEl.querySelector('.group-name');
        if (groupNameEl) {
          groupNameEl.focus();
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(groupNameEl);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    }
  } catch (error) {
    console.error('Error creating new group:', error);
    alert('Failed to create new group. Please try again.');
  }
});

chrome.tabs.onCreated.addListener(updateTabs);
chrome.tabs.onUpdated.addListener(updateTabs);
chrome.tabs.onRemoved.addListener(updateTabs);
chrome.tabs.onMoved.addListener(updateTabs);
chrome.tabs.onAttached.addListener(updateTabs);
chrome.tabs.onDetached.addListener(updateTabs);
chrome.tabs.onActivated.addListener(handleTabActivation);
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
