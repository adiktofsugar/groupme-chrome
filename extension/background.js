var groupMe = new GroupMe();

var popupOpen = false;
var messagesSinceLastPopup = 0;
function onPopupOpen() {
    console.log('popup open');
    popupOpen = true;
    messagesSinceLastPopup = 0;
    renderBadge();
}
function onPopupClose() {
    console.log('popup closed');
    popupOpen = false;
    renderBadge();
}

function renderBadge() {
    chrome.browserAction.setTitle({
        title: 'GroupMe - ' + messagesSinceLastPopup + ' unread messages'
    });
    var badgeText = '';
    var badgeBackgroundColor = [0,0,0,0];
    if (messagesSinceLastPopup) {
        badgeText = String(messagesSinceLastPopup);
        badgeBackgroundColor = [255, 0, 0, 255];
    }
    chrome.browserAction.setBadgeText({
        text: badgeText
    });
    chrome.browserAction.setBadgeBackgroundColor({
        color: badgeBackgroundColor
    });
}
renderBadge();

groupMe.events.on("notifier:show", function (message) {
    if (!popupOpen) {
        messagesSinceLastPopup += 1;
    }
    renderBadge();
});

var popupPortName = 'popup';
chrome.runtime.onConnect.addListener(function (port) {
    if (port.name == popupPortName) {
        onPopupOpen();
        port.onDisconnect.addListener(onPopupClose);
    }
});


window.groupMe = groupMe;
window.GroupMeMessage = GroupMeMessage;
window.popupPortName = popupPortName;
