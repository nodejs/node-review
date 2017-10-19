/* global browser, fetch, URL */

'use strict'

if (typeof browser !== 'undefined') {
  var chrome = browser
}

const PR_RE = /^\/nodejs\/([^/]+)\/pull\/([^/]+)\/?$/

function updateButton (tabId, url) {
  if (url === undefined) return
  if (PR_RE.test(new URL(url).pathname)) {
    chrome.pageAction.show(tabId)
  } else {
    chrome.pageAction.hide(tabId)
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  updateButton(tabId, changeInfo && changeInfo.url)
})

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tabInfo) => {
    updateButton(activeInfo.tabId, tabInfo && tabInfo.url)
  })
})

chrome.pageAction.onClicked.addListener((tab) => {
  chrome.tabs.executeScript(tab.id, {
    file: 'review.js'
  })
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  fetch(request.url)
    .then((res) => res.text())
    .then((body) => {
      sendResponse({body: body})
    })
    .catch(function (err) {
      sendResponse({error: err})
    })

  return true
})

// Ensure that the active tabs in each window are set up.
chrome.tabs.query({active: true}, (tabs) => {
  tabs.forEach((tab) => {
    updateButton(tab.id, tab.url)
  })
})
