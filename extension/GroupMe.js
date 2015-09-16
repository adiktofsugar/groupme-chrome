var nameToTokenMap = {
    'token': 'groupme-chrome-token',
    'groupId': 'groupme-chrome-groupId',
    'groupName': 'groupme-chrome-groupName',
};

function GroupMeGroupCache(groupMe) {
    var groupById = {};
    function get(id, callback) {
        callback = callback || function () {};
        if (groupById[id]) {
            return callback(null, groupById[id]);
        }
        groupMe.api('/groups/' + id, function (error, group) {
            if (error) {
                return callback(error);
            }
            groupById[id] = {
                id: group.id,
                name: group.name,
                image: group.image_url
            };
            callback(null, groupById[id]);
        });
    }
    this.get = get;
}

function GroupMeNotification(message, group) {
    var subject = message.subject;
    var id = subject.id;
    var attachments = subject.attachments;
    var notificationId = null;
    var unrenderTimeout = null;

    function render() {
        var options = {
            type: 'basic',
            title: group.name || "GroupMe" + " - " + subject.name,
            message: (subject.text || "(no text)") +
                ((attachments.length) ? " - " +  attachments.length + " attachments" : ""),
            iconUrl: subject.avatar_url || group.image || 'icon.png'
        };
        chrome.notifications.create(id, options, function (createdNotificationId) {
            notificationId = createdNotificationId;
        });
        unrenderTimeout = setTimeout(function () {
            unrender();
        }, 5000);
    }
    function unrender() {
        clearTimeout(unrenderTimeout);
        if (notificationId) {
            chrome.notifications.clear(notificationId);
        }
    }

    function getNotificationId() {
        return notificationId;
    }
    function getGroupId() {
        return group.id;
    }

    this.render = render;
    this.unrender = unrender;

    this.getNotificationId = getNotificationId;
    this.getGroupId = getGroupId;
}

function GroupMeNotifier(groupMe, options) {
    var client = null;
    var subscription = null;
    var groupCache = new GroupMeGroupCache(groupMe);
    var notifications = [];

    options = options || {};
    var showMessagesFromUser = options.showMessagesFromUser || false;

    function start() {
        var notifier = this;
        groupMe.api('/users/me', function (error, me) {
            if (error) {
                groupMe.getCache(function (cache) {
                    if (!cache.token) {
                        console.error("No token. Will try to start once token is set.");
                        return;
                    }
                    console.error("Couldn't get user, trying again in 5 seconds.");
                    setTimeout(function () {
                        notifier.start();
                    }, 5000);
                });
                return;
            }
            var userId = me.id;
            if (!userId) {
                throw new Error("notifier needs a userId");
            }
            groupMe.getCache(function (cache) {
                var token = cache.token;
                client = new Faye.Client('https://push.groupme.com/faye');
                client.disable('websocket');
                client.addExtension({
                    outgoing: function(message, callback){
                        if (message.channel !== '/meta/subscribe'){
                            return callback(message);
                        }
                        message.ext = message.ext || {};
                        message.ext.access_token = token;
                        message.ext.timestamp = Date.now()/1000 |0;
                        callback(message);
                    }
                });
                subscription = client.subscribe('/user/' + userId, function (message) {
                    if (message.type == "line.create" && 
                        (showMessagesFromUser || message.subject.sender_id !== userId)) {
                        show(message);
                    }
                });
            });
        });
    }
    function stop() {
        if (client) {
            client.disconnect();
        }
        client = null;
    }

    var MAX_NOTIFICATIONS = 5;
    function show(message, callback) {
        console.log("Got message");
        console.dir(message);

        var subject = message.subject;
        groupCache.get(subject.group_id, function (error, group) {
            var notification = new GroupMeNotification(message, group);
            notifications.push(notification);
            notification.render();

            var removeNotification;
            while (notifications.length > MAX_NOTIFICATIONS) {
                removeNotification = notifications.shift();
                removeNotification.unrender();
            }
        });
    }

    chrome.storage.onChanged.addListener(function (changes, namespace) {
        var tokenChange = changes[ nameToTokenMap.token ];
        if (tokenChange) {
            stop();
            if (tokenChange.newValue) {
                start();
            }
        }
    });
    chrome.notifications.onClicked.addListener(function (notificationId) {
        var notification = notifications.map(function (notification) {
            if (notification.getNotificationId() == notificationId) {
                return notification;
            }
        })[0];
        if (notification) {
            var newURL = "https://app.groupme.com/chats/" + notification.getGroupId();
            chrome.tabs.query({"url" : "https://app.groupme.com/*"}, function(tabs){
                if (tabs.length > 0){
                    var matchedTab = tabs[0];
                    chrome.windows.update(matchedTab.windowId, {
                        "focused": true
                    });
                    chrome.tabs.update(matchedTab.id, {
                        "active": true,
                        "url": newURL
                    });
                } else {
                    chrome.tabs.create({
                        url: newURL
                    });
                }
            });
        }
    });

    this.start = start;
    this.stop = stop;
}

function GroupMe() {
    var authorizeUri = 'https://oauth.groupme.com/oauth/authorize?client_id=KRSKsn6m30Q8Bey31dBRxKsOBmtMMVQXowHdU1KsO8SinOPV';
    var oauthCallbackUri = 'https://groupme-chrome.s3-website-us-west-1.amazonaws.com/oauth_callback.html';

    var baseApiUri = 'https://api.groupme.com/v3';
    function ApiError(meta) {
        var errors = meta.errors;
        var code = meta.code;
        var message = "Status Code: " + code + 
                    " Errors: " + errors.join(",")
        
        this.code = code;
        this.message = message;
    }
    ApiError.prototype = new Error();

    function api(path, options, callback) {
        if (callback === undefined) {
            callback = options;
            options = {};
        }
        options = options || {};
        callback = callback || function () {};
        getCache(function (cache) {
            var token = cache.token;
            if (token === null) {
                return callback(new Error("No access token. Login or die."));
            }

            function complete(data) {
                var meta = data.meta;
                var code = meta.code;
                if (!String(code).match(/^2/)) {
                    return callback(new ApiError(meta));
                }
                callback(null, data.response);
            }
            var type = options.type || "get";
            var data = options.data ? JSON.stringify(options.data) : null;
            $.ajax({
                url: baseApiUri + path,
                type: type,
                data: data,
                contentType: "application/json",
                processData: false,
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('X-Access-Token', token);
                },
                success: function (data) {
                    complete(data);
                },
                error: function (xhr, status, error) {
                    var data = JSON.parse(xhr.responseText);
                    complete(data);
                }
            });
        });
    }

    var popupReference = null;

    function login(callback) {
        callback = callback || function () {};
        function onRemoved (tabId) {
            if (popupReference && popupReference.tabId === tabId) {
                popupReference = null;
            }
        }
        function onUpdated (tabId, changeInfo, tab) {
            if (popupReference && popupReference.id == tabId) {
                console.log("popup was updated - " + 
                    "status: " + changeInfo.status +
                    "url: " + changeInfo.url);
                if (changeInfo.url.match(oauthCallbackUri)) {
                    done();
                }
            }
        }
        
        function done() {
            chrome.tabs.onRemoved.removeListener(onRemoved);
            chrome.tabs.onUpdated.removeListener(onUpdated);

            chrome.tabs.get(popupReference.id, function (tab) {
                var uri = new Uri(tab.url);
                chrome.tabs.remove(tab.id, function () {
                    var token = uri.getQueryParamValue("access_token");
                    if (!token) {
                        callback(new Error("Couldn't log in"));
                    } else {
                        setCache({
                            token: token
                        }, function () {
                            callback(null);
                        });
                    }
                });
            });
        }

        setCache({
            token: null
        }, function () {
            chrome.tabs.onRemoved.addListener(onRemoved);
            chrome.tabs.onUpdated.addListener(onUpdated);
            
            if (popupReference === null) {
                chrome.tabs.create({
                    url: authorizeUri
                }, function (tab) {
                    popupReference = tab;
                })
            } else {
                chrome.tabs.update(popupReference.id, {
                    active: true
                });
            }
        });
    }

    function logout(callback) {
        callback = callback || function () {};
        setCache({
            token: null
        }, function () {
            callback();
        });
    }

    function getCache(callback) {
        callback = callback || function () {};
        var tokenKeys = Object.keys(nameToTokenMap).map(function (name) {
            return nameToTokenMap[name];
        });
        chrome.storage.sync.get(tokenKeys, function (cache) {
            var publicCache = {};
            Object.keys(nameToTokenMap).forEach(function (name) {
                publicCache[name] = cache[ nameToTokenMap[name] ];
            });
            callback(publicCache);
        });
    }
    function setCache(publicCache, callback) {
        callback = callback || function () {};
        var cache = {};
        Object.keys(nameToTokenMap).forEach(function (name) {
            if (publicCache[name] !== undefined) {
                cache[ nameToTokenMap[name] ] = publicCache[name];
            }
        });
        chrome.storage.sync.set(cache, callback);
    }

    this.login = login;
    this.logout = logout;
    this.api = api;
    this.getCache = getCache;
    this.setCache = setCache;

    var notifier = new GroupMeNotifier(this, {
        showMessagesFromUser: true
    });
    notifier.start();

}
