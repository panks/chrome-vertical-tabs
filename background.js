// In-memory stores are replaced with chrome.storage.session for persistence across service worker restarts.
async function getState() {
    const result = await chrome.storage.session.get(['tabGroupMap', 'windowData']);
    return {
        tabGroupMap: result.tabGroupMap || {},
        windowData: result.windowData || {}
    };
}

async function setState(newState) {
    await chrome.storage.session.set(newState);
}

// Removed Chrome context menu - will be replaced with custom context menu in sidepanel

chrome.tabs.onCreated.addListener(async (newTab) => {
    let { tabGroupMap } = await getState();
    let openerGroupId;

    // For duplicated tabs, openerTabId is set to the ID of the original tab.
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
        await setState({ tabGroupMap });
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const { tabGroupMap } = await getState();
    delete tabGroupMap[tabId];
    await setState({ tabGroupMap });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        if (message.action === 'getTabGroupMap') {
            const { tabGroupMap, windowData } = await getState();
            const windowId = message.windowId;
            if (!windowId) {
                sendResponse({ tabGroupMap: tabGroupMap, groupNames: {} });
                return;
            }
            const windowGroups = windowData[windowId] ? windowData[windowId].groupNames : {};
            sendResponse({ tabGroupMap: tabGroupMap, groupNames: windowGroups });
        } else if (message.action === 'updateMultipleTabGroups') {
            const { tabGroupMap } = await getState();
            message.tabIds.forEach(tabId => {
                tabGroupMap[tabId] = message.newGroupId;
            });
            await setState({ tabGroupMap });
            sendResponse({ success: true });
        } else if (message.action === 'addTabToNewGroup') {
            const { tabGroupMap, windowData } = await getState();
            const { windowId, tabId } = message;
            if (!windowId) {
                sendResponse({ success: false, error: 'windowId is required' });
                return;
            }
            const newGroupId = message.groupId || `group-${Date.now()}`;
            if (!windowData[windowId]) {
                windowData[windowId] = { groupNames: {} };
            }
            const groupName = message.groupName || `Group ${Object.keys(windowData[windowId].groupNames).length + 1}`;
            
            tabGroupMap[tabId] = newGroupId;
            windowData[windowId].groupNames[newGroupId] = groupName;
            
            await setState({ tabGroupMap, windowData });
            
            sendResponse({ success: true, groupId: newGroupId, groupName: groupName });
        } else if (message.action === 'updateGroupName') {
            const { windowId, groupId, groupName } = message;
            if (groupId && groupName && windowId) {
                const { windowData } = await getState();
                if (windowData[windowId] && windowData[windowId].groupNames) {
                    windowData[windowId].groupNames[groupId] = groupName;
                    await setState({ windowData });
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'Window or group not found.' });
                }
            } else {
                sendResponse({ success: false, error: 'Invalid parameters for group name update.' });
            }
        } else if (message.action === 'createGroup') {
            const { windowData } = await getState();
            const { windowId } = message;
            if (!windowId) {
                sendResponse({ success: false, error: 'windowId is required' });
                return;
            }
            const newGroupId = message.groupId || `group-${Date.now()}`;
            const groupName = message.groupName || `New Group`;
            if (!windowData[windowId]) {
                windowData[windowId] = { groupNames: {} };
            }
            if (!windowData[windowId].groupNames[newGroupId]) {
                windowData[windowId].groupNames[newGroupId] = groupName;
                await setState({ windowData });
                sendResponse({ success: true, groupId: newGroupId, groupName: groupName });
            } else {
                sendResponse({ success: false, error: 'Group already exists' });
            }
        } else if (message.action === 'deleteGroup') {
            const { windowId, groupId } = message;
            if (groupId && windowId) {
                const { windowData, tabGroupMap } = await getState();
                if (windowData[windowId] && windowData[windowId].groupNames[groupId]) {
                    delete windowData[windowId].groupNames[groupId];
                    
                    // Ungroup tabs that were in this group
                    for (const tabId in tabGroupMap) {
                        if (tabGroupMap[tabId] === groupId) {
                            delete tabGroupMap[tabId];
                        }
                    }
                    await setState({ windowData, tabGroupMap });
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'Group not found' });
                }
            } else {
                sendResponse({ success: false, error: 'Group ID and Window ID are required' });
            }
        }
    })();
    return true; // Indicates that the response is sent asynchronously
});
