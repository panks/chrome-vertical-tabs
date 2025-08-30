let tabGroupMap = {}; // In-memory store: { tabId: groupId }
let groupNames = {}; // In-memory store: { groupId: groupName }

// Removed Chrome context menu - will be replaced with custom context menu in sidepanel

chrome.tabs.onCreated.addListener(async (newTab) => {
  let openerGroupId;

  if (newTab.openerTabId) {
    openerGroupId = tabGroupMap[newTab.openerTabId];
  }

  // Fallback for cases like "New Tab to the Right" where openerTabId is not set.
  if (!openerGroupId && newTab.index > 0) {
    try {
      const [leftTab] = await chrome.tabs.query({
        windowId: newTab.windowId,
        index: newTab.index - 1
      });

      if (leftTab) {
        openerGroupId = tabGroupMap[leftTab.id];
      }
    } catch (error) {
      console.error('Error finding group for new tab:', error);
    }
  }

  if (openerGroupId) {
    tabGroupMap[newTab.id] = openerGroupId;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabGroupMap[tabId];
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getTabGroupMap') {
        sendResponse({ tabGroupMap: tabGroupMap, groupNames: groupNames });
    } else if (message.action === 'updateTabGroup') {
        tabGroupMap[message.tabId] = message.newGroupId;
        sendResponse({ success: true }); // Acknowledge the message
    } else if (message.action === 'addTabToNewGroup') {
        // Create new group and add tab to it
        const newGroupId = message.groupId || `group-${Date.now()}`;
        const groupName = message.groupName || `Group ${Object.keys(groupNames).length + 1}`;
        
        tabGroupMap[message.tabId] = newGroupId;
        groupNames[newGroupId] = groupName;
        
        sendResponse({ success: true, groupId: newGroupId, groupName: groupName });
    } else if (message.action === 'updateGroupName') {
        // Handle group name updates
        if (message.groupId && message.groupName) {
            groupNames[message.groupId] = message.groupName;
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Invalid parameters for group name update.' });
        }
    } else if (message.action === 'createGroup') {
        const newGroupId = message.groupId || `group-${Date.now()}`;
        const groupName = message.groupName || `New Group`;
        if (!groupNames[newGroupId]) {
            groupNames[newGroupId] = groupName;
            sendResponse({ success: true, groupId: newGroupId, groupName: groupName });
        } else {
            sendResponse({ success: false, error: 'Group already exists' });
        }
    } else if (message.action === 'deleteGroup') {
        if (message.groupId && groupNames[message.groupId]) {
            delete groupNames[message.groupId];
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Group not found' });
        }
    }
    return true; // Indicates that the response is sent asynchronously
});
