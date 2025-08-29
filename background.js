let tabGroupMap = {}; // In-memory store: { tabId: groupId }

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-new-group",
    title: "Add to New Group",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "add-to-new-group") {
    const newGroupId = `group-${Date.now()}`;
    tabGroupMap[tab.id] = newGroupId;
    
    // Notify the side panel to update with error handling
    try {
      chrome.runtime.sendMessage({ action: 'updatePanel' });
    } catch (error) {
      console.warn('Failed to notify side panel:', error);
    }
  }
});

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
        sendResponse({ tabGroupMap: tabGroupMap });
    } else if (message.action === 'updateTabGroup') {
        tabGroupMap[message.tabId] = message.newGroupId;
    }
    return true; // Indicates that the response is sent asynchronously
});
