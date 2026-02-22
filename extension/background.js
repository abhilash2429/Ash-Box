'use strict';

async function resolveWindowId(windowId) {
  if (typeof windowId === 'number' && windowId >= 0) {
    return windowId;
  }

  if (!chrome?.windows?.getLastFocused) {
    return undefined;
  }

  try {
    const currentWindow = await chrome.windows.getLastFocused();
    if (typeof currentWindow?.id === 'number' && currentWindow.id >= 0) {
      return currentWindow.id;
    }
  } catch (error) {
    console.error('Resolve window error:', error);
  }

  return undefined;
}

async function ensurePanelBehavior() {
  if (!chrome?.sidePanel?.setPanelBehavior) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error('Side panel behavior error:', error);
  }
}

async function openPanel(windowId) {
  if (!chrome?.sidePanel?.open) {
    console.error('Side Panel API is not available in this browser build.');
    return;
  }

  try {
    const resolvedWindowId = await resolveWindowId(windowId);
    if (typeof resolvedWindowId !== 'number') {
      console.error('Could not resolve a target window for side panel open.');
      return;
    }

    await chrome.sidePanel.open({ windowId: resolvedWindowId });
  } catch (error) {
    console.error('Side panel open error:', error);
  }
}

void ensurePanelBehavior();

chrome.runtime.onInstalled.addListener((details) => {
  void ensurePanelBehavior();

  if (details.reason === 'install') {
    console.log('Ash Box extension installed');
  } else if (details.reason === 'update') {
    console.log('Ash Box extension updated');
  }
});

chrome.runtime.onStartup.addListener(() => {
  void ensurePanelBehavior();
});

chrome.action.onClicked.addListener((tab) => {
  const windowId = tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  void openPanel(windowId);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-side-panel') {
    void openPanel();
  }
});
