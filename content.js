/*
 * Content script for Chrome Sounds.
 * Tracks in-page events and notifies the background page.
 */

function sendEvent(event, value) {
  console.log("Content script - sendEvent: " + event + "," + value);
  
  // Check if chrome.runtime is available
  if (typeof chrome === 'undefined' || typeof chrome.runtime === 'undefined' || typeof chrome.runtime.sendMessage !== 'function') {
    console.error("chrome.runtime.sendMessage is not available");
    return;
  }
  
  // If value is empty, just play the sound once
  const message = value ? { eventName: event, eventValue: value } : { eventName: event };
  
  // Retry logic for "Extension context invalidated"
  function sendWithRetry(message, retries = 3, delay = 100) {
    chrome.runtime.sendMessage(message).catch(e => {
      console.error("Error sending message:", e);
      if (retries > 0 && (e.message.includes("Extension context invalidated") || e.message.includes("Could not establish connection"))) {
        setTimeout(() => sendWithRetry(message, retries - 1, delay * 2), delay);
      }
    });
  }
  
  sendWithRetry(message);
}

// Timers to trigger "stopEvent" for coalescing events.
var timers = {};

function stopEvent(type) {
  timers[type] = 0;
  sendEvent(type, "stopped");
}

// Automatically coalesces repeating events into a start and a stop event.
// |validator| is a function which should return true if the event is
// considered to be a valid event of this type.
// |shouldLoop| determines if the sound should loop (default: true for continuous events)
function handleEvent(event, type, validator, shouldLoop = true) {
  if (validator) {
    if (!validator(event)) {
      return;
    }
  }
  var timerId = timers[type];
  var eventInProgress = (timerId > 0);
  if (eventInProgress) {
    clearTimeout(timerId);
    timers[type] = 0;
  } else {
    sendEvent(type, shouldLoop ? "started" : "");
  }
  timers[type] = setTimeout(stopEvent, 300, type);
}

function listenAndCoalesce(target, domType, validator, shouldLoop = true, soundName) {
  const eventName = soundName || domType;
  target.addEventListener(domType, function(event) {
    handleEvent(event, eventName, validator, shouldLoop);
  }, true);
}

function stopKeypressSound() {
  const timerId = timers["keypress"];
  if (timerId > 0) {
    clearTimeout(timerId);
    timers["keypress"] = 0;
  }
  sendEvent("keypress", "stopped");
}

console.log("Content script loaded - Adding scroll listener");
// Disable loop for scroll sound to avoid infinite playback
listenAndCoalesce(document, "scroll", null, false);

// Window resize events belong to the window, not document.body. Restrict this
// listener to the top-level document so iframes cannot generate duplicates.
if (window === window.top) {
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = 0;
      sendEvent("resize", "");
    }, 100);
  });
}

listenAndCoalesce(document, "keydown", function(event) {
  if (event.key === "Enter")
    return false;

  // TODO(erikkay) This doesn't work in gmail's rich text compose window.
  return event.target.tagName == "TEXTAREA" ||
         event.target.tagName == "INPUT" ||
         event.target.isContentEditable;
}, false, "keypress");

if (window === window.top) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopKeypressSound();
    }
  });
}
