'use strict'

const PR_RE = /^\/nodejs\/([^\/]+)\/pull\/([^\/]+)\/?$/

const b = chrome.extension.getBackgroundPage()
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url === undefined) return
  if (PR_RE.test(new URL(changeInfo.url).pathname)) {
    chrome.browserAction.enable()
    chrome.browserAction.setIcon({
      path: 'icon_good.png'
    })
  } else {
    chrome.browserAction.disable()
    chrome.browserAction.setIcon({
      path: 'icon_disabled.png'
    })
  }
})

chrome.browserAction.onClicked.addListener(function(tab) {
  b.console.log('Generating review metadata...')
  chrome.tabs.executeScript(null, {
    file: 'review.js'
  })
})
