// In-memory stores are replaced with chrome.storage.session for persistence across service worker restarts.
async function getState() {
    const result = await chrome.storage.session.get(['tabGroupMap', 'groupNames']);
    return {
        tabGroupMap: result.tabGroupMap || {},
        groupNames: result.groupNames || {}
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
            const { tabGroupMap, groupNames } = await getState();
            sendResponse({ tabGroupMap: tabGroupMap, groupNames: groupNames });
        } else if (message.action === 'updateTabGroup') {
            const { tabGroupMap } = await getState();
            tabGroupMap[message.tabId] = message.newGroupId;
            await setState({ tabGroupMap });
            sendResponse({ success: true });
        } else if (message.action === 'addTabToNewGroup') {
            const { tabGroupMap, groupNames } = await getState();
            const newGroupId = message.groupId || `group-${Date.now()}`;
            const groupName = message.groupName || `Group ${Object.keys(groupNames).length + 1}`;
            
            tabGroupMap[message.tabId] = newGroupId;
            groupNames[newGroupId] = groupName;
            
            await setState({ tabGroupMap, groupNames });
            
            sendResponse({ success: true, groupId: newGroupId, groupName: groupName });
        } else if (message.action === 'updateGroupName') {
            if (message.groupId && message.groupName) {
                const { groupNames } = await getState();
                groupNames[message.groupId] = message.groupName;
                await setState({ groupNames });
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Invalid parameters for group name update.' });
            }
        } else if (message.action === 'createGroup') {
            const { groupNames } = await getState();
            const newGroupId = message.groupId || `group-${Date.now()}`;
            const groupName = message.groupName || `New Group`;
            if (!groupNames[newGroupId]) {
                groupNames[newGroupId] = groupName;
                await setState({ groupNames });
                sendResponse({ success: true, groupId: newGroupId, groupName: groupName });
            } else {
                sendResponse({ success: false, error: 'Group already exists' });
            }
        } else if (message.action === 'deleteGroup') {
            if (message.groupId) {
                const { groupNames } = await getState();
                if (groupNames[message.groupId]) {
                    delete groupNames[message.groupId];
                    await setState({ groupNames });
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'Group not found' });
                }
            } else {
                sendResponse({ success: false, error: 'Group not found' });
            }
        }
    })();
    return true; // Indicates that the response is sent asynchronously
});
