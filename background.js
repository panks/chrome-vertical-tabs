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
 * Only updates existing session, never creates a new one
 */
async function autoSaveSession() {
    console.log('Auto-saving session. Current time:', new Date().toISOString());
    try {
        const sessionState = await collectSessionState();
        const totalCurrentTabs = sessionState.windows.reduce((sum, w) => sum + w.tabs.length, 0);
        
        // Skip saving sessions with no restorable tabs
        if (totalCurrentTabs === 0) {
            return;
        }
        
        // Only update existing session, never create new one during auto-save
        await updateCurrentSession(sessionState);
    } catch (error) {
        console.error('Error auto-saving session:', error);
    }
}

/**
 * Migrates from old single-session storage to new multi-session storage
 */
async function migrateFromOldStorage() {
    const oldData = await chrome.storage.local.get(['savedSession', 'lastSaved']);
    const newData = await chrome.storage.local.get(['sessions']);
    
    // If we have old data but no new data, migrate it
    if (oldData.savedSession && !newData.sessions) {
        console.log('Migrating from old session storage format...');
        
        const legacySession = oldData.savedSession;
        const totalTabs = legacySession.windows.reduce((sum, w) => sum + w.tabs.length, 0);
        const windowCount = legacySession.windows.length;
        
        const migratedSession = {
            id: `session-${oldData.lastSaved || Date.now()}`,
            timestamp: oldData.lastSaved || legacySession.timestamp || Date.now(),
            totalTabs,
            windowCount,
            windows: legacySession.windows,
            groupNames: {} // Legacy sessions don't have group names
        };
        
        await chrome.storage.local.set({ sessions: [migratedSession] });
        
        // Clean up old storage
        await chrome.storage.local.remove(['savedSession', 'lastSaved']);
        
        console.log('Migration completed successfully');
    }
}

/**
 * Gets the session configuration with defaults
 */
async function getSessionConfig() {
    const result = await chrome.storage.local.get(['sessionConfig']);
    return {
        maxSessions: 3,
        ...result.sessionConfig
    };
}

/**
 * Gets all stored sessions
 */
async function getStoredSessions() {
    const result = await chrome.storage.local.get(['sessions']);
    return result.sessions || [];
}

/**
 * Determines if we should create a new session based on current state
 */
async function shouldCreateNewSession() {
    const sessions = await getStoredSessions();
    
    // If no sessions exist, create the first one
    if (sessions.length === 0) {
        return true;
    }
    
    // Check if this appears to be a fresh browser start
    // (single window with minimal tabs that might be new tab pages or restored tabs)
    const allWindows = await chrome.windows.getAll();
    const totalTabs = await chrome.tabs.query({});
    
    // If we have only one window and very few tabs, and the last session 
    // has significantly more data, this might be a fresh start
    if (allWindows.length === 1 && totalTabs.length <= 2) {
        const lastSession = sessions[0]; // Most recent session
        if (lastSession && lastSession.totalTabs > 3) {
            return true;
        }
    }
    
    return false;
}

/**
 * Creates a new session and adds it to storage
 */
async function createNewSession(sessionState) {
    const sessions = await getStoredSessions();
    const config = await getSessionConfig();
    
    const totalTabs = sessionState.windows.reduce((sum, w) => sum + w.tabs.length, 0);
    const windowCount = sessionState.windows.length;
    
    const newSession = {
        id: `session-${Date.now()}`,
        timestamp: Date.now(),
        totalTabs,
        windowCount,
        windows: sessionState.windows,
        groupNames: sessionState.groupNames || {}
    };
    
    // Add new session to the beginning of the array
    sessions.unshift(newSession);
    
    // Keep only the configured number of sessions
    const trimmedSessions = sessions.slice(0, config.maxSessions);
    
    await chrome.storage.local.set({ sessions: trimmedSessions });
    return newSession;
}

/**
 * Updates the most recent session with current state
 */
async function updateCurrentSession(sessionState) {
    const sessions = await getStoredSessions();
    
    if (sessions.length === 0) {
        // No existing sessions, create a new one
        return await createNewSession(sessionState);
    }
    
    const totalTabs = sessionState.windows.reduce((sum, w) => sum + w.tabs.length, 0);
    const windowCount = sessionState.windows.length;
    
    // Update the most recent session (first in array)
    sessions[0] = {
        ...sessions[0],
        timestamp: Date.now(),
        totalTabs,
        windowCount,
        windows: sessionState.windows,
        groupNames: sessionState.groupNames || {}
    };
    
    await chrome.storage.local.set({ sessions });
    return sessions[0];
}

/**
 * Collects current state of all tabs and groups across all windows
 */
async function collectSessionState() {
    const { tabGroupMap, windowData } = await getState();
    const allWindows = await chrome.windows.getAll();
    const sessionWindows = [];
    const allGroupNames = {};

    for (const window of allWindows) {
        const tabs = await chrome.tabs.query({ windowId: window.id });
        const windowGroups = windowData[window.id] ? windowData[window.id].groupNames : {};
        
        // Collect all group names across windows
        Object.assign(allGroupNames, windowGroups);
        
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
        groupNames: allGroupNames,
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

    // Check if we should create a new session on tab creation
    // This handles the case where browser was restarted and first tab is created
    if (await shouldCreateNewSession()) {
        try {
            const sessionState = await collectSessionState();
            await createNewSession(sessionState);
        } catch (error) {
            console.error('Error creating new session on tab creation:', error);
        }
    }

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
            // Manual save session (updates current session, doesn't create new one)
            try {
                const sessionState = await collectSessionState();
                const totalTabs = sessionState.windows.reduce((sum, w) => sum + w.tabs.length, 0);
                
                if (totalTabs === 0) {
                    sendResponse({ success: false, error: 'No restorable tabs to save' });
                    return;
                }
                
                await updateCurrentSession(sessionState);
                sendResponse({ success: true, message: 'Session saved successfully' });
            } catch (error) {
                console.error('Error saving session:', error);
                sendResponse({ success: false, error: 'Failed to save session' });
            }
        } else if (message.action === 'restoreSession') {
            // Restore selected session
            try {
                const { sessionId } = message;
                const sessions = await getStoredSessions();
                
                if (sessions.length === 0) {
                    sendResponse({ success: false, error: 'No saved sessions found' });
                    return;
                }
                
                let sessionToRestore;
                if (sessionId) {
                    sessionToRestore = sessions.find(s => s.id === sessionId);
                    if (!sessionToRestore) {
                        sendResponse({ success: false, error: 'Selected session not found' });
                        return;
                    }
                } else {
                    // Default to most recent session
                    sessionToRestore = sessions[0];
                }
                
                await restoreSession(sessionToRestore);
                sendResponse({ success: true, message: 'Session restored successfully' });
            } catch (error) {
                console.error('Error restoring session:', error);
                sendResponse({ success: false, error: 'Failed to restore session' });
            }
        } else if (message.action === 'getStoredSessions') {
            // Get information about all stored sessions
            try {
                const sessions = await getStoredSessions();
                sendResponse({ 
                    success: true, 
                    sessions: sessions.map(session => ({
                        id: session.id,
                        timestamp: session.timestamp,
                        totalTabs: session.totalTabs,
                        windowCount: session.windowCount
                    }))
                });
            } catch (error) {
                console.error('Error getting stored sessions:', error);
                sendResponse({ success: false, error: 'Failed to get session info' });
            }
        } else if (message.action === 'getSessionConfig') {
            // Get session configuration
            try {
                const config = await getSessionConfig();
                sendResponse({ success: true, config });
            } catch (error) {
                console.error('Error getting session config:', error);
                sendResponse({ success: false, error: 'Failed to get session config' });
            }
        } else if (message.action === 'updateSessionConfig') {
            // Update session configuration
            try {
                const { config } = message;
                await chrome.storage.local.set({ sessionConfig: config });
                
                // Trim sessions if max count was reduced
                const sessions = await getStoredSessions();
                if (sessions.length > config.maxSessions) {
                    const trimmedSessions = sessions.slice(0, config.maxSessions);
                    await chrome.storage.local.set({ sessions: trimmedSessions });
                }
                
                sendResponse({ success: true, message: 'Session config updated successfully' });
            } catch (error) {
                console.error('Error updating session config:', error);
                sendResponse({ success: false, error: 'Failed to update session config' });
            }
        }
    })();
    return true; // Indicates that the response is sent asynchronously
});

/**
 * Restores a saved session by creating new windows and tabs
 */
async function restoreSession(session) {
    if (!session || !session.windows || session.windows.length === 0) {
        throw new Error('No valid session data to restore');
    }
    
    // Get current state
    const { tabGroupMap, windowData: currentWindowData } = await getState();
    
    for (const windowData of session.windows) {
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
            
            // Set up group names for this window - use both window-specific and session-wide group names
            if (!currentWindowData[newWindowId]) {
                currentWindowData[newWindowId] = { groupNames: {} };
            }
            
            // Merge window-specific group names with session-wide group names
            const windowGroupNames = windowData.groupNames || {};
            const sessionGroupNames = session.groupNames || {};
            currentWindowData[newWindowId].groupNames = { 
                ...sessionGroupNames, 
                ...windowGroupNames 
            };
            
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
            
        } catch (windowError) {
            console.error('Error restoring window:', windowError);
            // Continue with other windows even if one fails
        }
    }
    
    // Save the updated state after all windows are processed
    await setState({ tabGroupMap, windowData: currentWindowData });
}

// Run migration on startup
chrome.runtime.onStartup.addListener(migrateFromOldStorage);
chrome.runtime.onInstalled.addListener(migrateFromOldStorage);

