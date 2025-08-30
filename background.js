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

// Auto-save session functionality
let saveTimeout = null;

/**
 * Debounced auto-save function to prevent excessive saves during rapid operations
 */
function debouncedAutoSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    saveTimeout = setTimeout(() => {
        autoSaveSession();
    }, 1000); // 1 second debounce delay
}

/**
 * Auto-saves the current session state to persistent storage
 */
async function autoSaveSession() {
    try {
        const sessionState = await collectSessionState();
        
        // Check if we have existing saved data and current state is minimal
        const existingData = await chrome.storage.local.get(['savedSession']);
        const totalCurrentTabs = sessionState.windows.reduce((sum, w) => sum + w.tabs.length, 0);
        
        if (existingData.savedSession && totalCurrentTabs === 0) {
            return;
        }
        
        // Only auto-save if we have meaningful data (at least 1 tab)
        if (totalCurrentTabs > 0) {
            await chrome.storage.local.set({ 
                savedSession: sessionState,
                lastSaved: Date.now()
            });
        }
    } catch (error) {
        console.error('Error auto-saving session:', error);
    }
}

/**
 * Collects current state of all tabs and groups across all windows
 */
async function collectSessionState() {
    const { tabGroupMap, windowData } = await getState();
    const allWindows = await chrome.windows.getAll();
    const sessionWindows = [];

    for (const window of allWindows) {
        const tabs = await chrome.tabs.query({ windowId: window.id });
        const windowGroups = windowData[window.id] ? windowData[window.id].groupNames : {};
        
        // Filter out invalid URLs that can't be restored
        const sessionTabs = tabs
            .filter(tab => isRestorableUrl(tab.url))
            .map(tab => ({
                url: tab.url,
                title: tab.title,
                pinned: tab.pinned,
                groupId: tabGroupMap[tab.id] || 'ungrouped'
            }));

        // Only add windows that have restorable tabs
        if (sessionTabs.length > 0) {
            sessionWindows.push({
                tabs: sessionTabs,
                groupNames: windowGroups
            });
        }
    }

    return {
        windows: sessionWindows,
        timestamp: Date.now()
    };
}

/**
 * Checks if a URL can be restored (filters out chrome:// URLs, extensions, etc.)
 */
function isRestorableUrl(url) {
    if (!url) return false;
    
    const restrictedPrefixes = [
        'chrome://',
        'chrome-extension://',
        'chrome-search://',
        'chrome-devtools://',
        'edge://',
        'about:',
        'moz-extension://'
    ];
    
    return !restrictedPrefixes.some(prefix => url.startsWith(prefix));
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
    
    // Auto-save session after tab creation
    debouncedAutoSave();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const { tabGroupMap } = await getState();
    delete tabGroupMap[tabId];
    await setState({ tabGroupMap });
    
    // Auto-save session after tab removal
    debouncedAutoSave();
});

// Auto-save on tab updates (URL changes, etc.)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only auto-save for meaningful changes like URL or title
    if (changeInfo.url || changeInfo.title) {
        debouncedAutoSave();
    }
});

// Auto-save on tab moves
chrome.tabs.onMoved.addListener(() => {
    debouncedAutoSave();
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
            debouncedAutoSave();
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
            debouncedAutoSave();
            
            sendResponse({ success: true, groupId: newGroupId, groupName: groupName });
        } else if (message.action === 'updateGroupName') {
            const { windowId, groupId, groupName } = message;
            if (groupId && groupName && windowId) {
                const { windowData } = await getState();
                if (windowData[windowId] && windowData[windowId].groupNames) {
                    windowData[windowId].groupNames[groupId] = groupName;
                    await setState({ windowData });
                    debouncedAutoSave();
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
                debouncedAutoSave();
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
                    debouncedAutoSave();
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'Group not found' });
                }
            } else {
                sendResponse({ success: false, error: 'Group ID and Window ID are required' });
            }
        } else if (message.action === 'saveSession') {
            // Manual save session (bypasses auto-save protection)
            try {
                const sessionState = await collectSessionState();
                await chrome.storage.local.set({ 
                    savedSession: sessionState,
                    lastSaved: Date.now()
                });
                sendResponse({ success: true, message: 'Session saved successfully' });
            } catch (error) {
                console.error('Error saving session:', error);
                sendResponse({ success: false, error: 'Failed to save session' });
            }
        } else if (message.action === 'restoreSession') {
            // Restore saved session
            try {
                const result = await chrome.storage.local.get(['savedSession']);
                if (!result.savedSession) {
                    sendResponse({ success: false, error: 'No saved session found' });
                    return;
                }
                
                const sessionState = result.savedSession;
                await restoreSession(sessionState);
                sendResponse({ success: true, message: 'Session restored successfully' });
            } catch (error) {
                console.error('Error restoring session:', error);
                sendResponse({ success: false, error: 'Failed to restore session' });
            }
        } else if (message.action === 'getSavedSessionInfo') {
            // Get information about saved session
            try {
                const result = await chrome.storage.local.get(['savedSession', 'lastSaved']);
                if (!result.savedSession) {
                    sendResponse({ success: false, error: 'No saved session found' });
                    return;
                }
                
                const totalTabs = result.savedSession.windows.reduce((sum, window) => sum + window.tabs.length, 0);
                const windowCount = result.savedSession.windows.length;
                
                sendResponse({ 
                    success: true, 
                    totalTabs, 
                    windowCount, 
                    lastSaved: result.lastSaved,
                    timestamp: result.savedSession.timestamp
                });
            } catch (error) {
                console.error('Error getting saved session info:', error);
                sendResponse({ success: false, error: 'Failed to get session info' });
            }
        }
    })();
    return true; // Indicates that the response is sent asynchronously
});

/**
 * Restores a saved session by creating new windows and tabs
 */
async function restoreSession(sessionState) {
    if (!sessionState || !sessionState.windows || sessionState.windows.length === 0) {
        throw new Error('No valid session data to restore');
    }
    
    for (const windowData of sessionState.windows) {
        // Skip empty windows
        if (!windowData.tabs || windowData.tabs.length === 0) {
            continue;
        }
        
        try {
            // Create new window with the first tab
            const firstTab = windowData.tabs[0];
            
            const newWindow = await chrome.windows.create({
                url: firstTab.url || 'about:blank',
                state: 'maximized'
            });
            
            const newWindowId = newWindow.id;
            const firstTabId = newWindow.tabs[0].id;
            
            // Update our internal state for the first tab
            const { tabGroupMap, windowData: currentWindowData } = await getState();
            
            // Set up group names for this window
            if (!currentWindowData[newWindowId]) {
                currentWindowData[newWindowId] = { groupNames: {} };
            }
            currentWindowData[newWindowId].groupNames = { ...windowData.groupNames };
            
            // Set group for first tab
            if (firstTab.groupId && firstTab.groupId !== 'ungrouped') {
                tabGroupMap[firstTabId] = firstTab.groupId;
            }
            
            // Create remaining tabs in the window
            for (let i = 1; i < windowData.tabs.length; i++) {
                const tab = windowData.tabs[i];
                
                try {
                    const newTab = await chrome.tabs.create({
                        windowId: newWindowId,
                        url: tab.url || 'about:blank',
                        pinned: tab.pinned || false
                    });
                    
                    // Set group for new tab
                    if (tab.groupId && tab.groupId !== 'ungrouped') {
                        tabGroupMap[newTab.id] = tab.groupId;
                    }
                } catch (tabError) {
                    console.error('Error creating tab:', tab.url, tabError);
                    // Continue with other tabs even if one fails
                }
            }
            
            // Save the updated state
            await setState({ tabGroupMap, windowData: currentWindowData });
            
        } catch (windowError) {
            console.error('Error restoring window:', windowError);
            // Continue with other windows even if one fails
        }
    }
}
