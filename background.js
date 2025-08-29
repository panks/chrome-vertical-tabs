let tabGroupMap = {}; // In-memory store: { tabId: groupId }
let groupNames = {}; // In-memory store: { groupId: groupName }

// Removed Chrome context menu - will be replaced with custom context menu in sidepanel

chrome.tabs.onCreated.addListener((newTab) => {
  if (newTab.openerTabId) {
    const openerGroupId = tabGroupMap[newTab.openerTabId];
    if (openerGroupId) {
      tabGroupMap[newTab.id] = openerGroupId;
    }
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
    }
    return true; // Indicates that the response is sent asynchronously
});
