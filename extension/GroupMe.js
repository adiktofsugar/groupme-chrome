var nameToTokenMap = {
    'token': 'groupme-chrome-token',
    'groupId': 'groupme-chrome-groupId',
    'groupName': 'groupme-chrome-groupName',

    'selfNotifications': 'selfNotifications',
    'notificationTimeout': 'notificationTimeout',
    'enableNotifications': 'enableNotifications'
};

function EventEmitter() {
    var registeredEventCallbacks = {};

    function on(eventName, callback) {
        if (!registeredEventCallbacks[eventName]) {
            registeredEventCallbacks[eventName] = [];
        }
        registeredEventCallbacks[eventName].push(callback);
    }
    function off(eventName) {
        registeredEventCallbacks[eventName] = null;
    }
    function trigger(eventName) {
        var args = Array.prototype.slice.call(arguments);
        var eventCallbacks = registeredEventCallbacks[eventName] || [];
        eventCallbacks.forEach(function (callback) {
            callback.apply(null, args.slice(1));
        });
    }
    this.on = on;
    this.off = off;
    this.trigger = trigger;
}

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

function GroupMeAttachment(attachmentObject) {
    var type = attachmentObject.type;

    function getVideoParameters() {
        var url = attachmentObject.url;
        if (!url) return;
        
        var sources = [];
        var posterUrl;

        var extension = url.match(/\.([a-zA-Z0-9]+)$/)[1].toLowerCase();
        var gifvMatch = url.match(/imgur\.com\/(.+?)\.gifv$/);
        if (gifvMatch) {
            var id = gifvMatch[1];
            posterUrl = 'https://i.imgur.com/' + id + 'h.jpg';
            sources = [
                {
                    type: 'video/mp4',
                    url: 'https://i.imgur.com/' + id + '.mp4'
                },
                {
                    type: 'video/webm',
                    url: 'https://i.imgur.com/' + id + '.webm'
                }
            ];
        } else {
            if (url.match(/^\/\//)) {
                url = 'http:' + url;
            } else if (!url.match(/^https?:\/\//)) {
                url = 'http://' + url;
            }
            sources = [
                {
                    type: 'video/' + extension,
                    url: url
                }
            ];
        }

        return {
            posterUrl: posterUrl,
            sources: sources
        };
    }

    var parameters;
    if (type == 'video') parameters = getVideoParameters();
    if (type == 'image') parameters = {
            url: attachmentObject.url
        }
    if (type == 'location') parameters = {
            lat: attachmentObject.lat,
            lng: attachmentObject.lng
        }
    if (type == 'split') parameters = {
            token: attachmentObject.token
        }
    if (type == 'emoji') parameters = {
            placeholder: attachmentObject.placeholder,
            charmap: attachmentObject.charmap
        }

    this.type = type;
    for (var key in parameters) {
        this[key] = parameters[key];
    }
}

function GroupMeMessage(messageObject) {
    var id = messageObject.id;
    var createdAt = new Date(messageObject.created_at);
    var userId = messageObject.user_id;
    var groupId = messageObject.group_id;
    var name = messageObject.name;
    var avatarUrl = messageObject.avatar_url;
    var text = messageObject.text;
    var attachments = messageObject.attachments.map(function (attachmentObject) {
        return new GroupMeAttachment(attachmentObject);
    });
    (text || '').autoLink({
        callback: function (url) {
            if (url.match(/\.(gif|png|jpe?g)$/i)) {
                attachments.push(
                    new GroupMeAttachment({
                        type: 'image',
                        url: url
                    })
                );
            } else if (url.match(/\.(gifv|mp4|webm)$/i)) {
                attachments.push(
                    new GroupMeAttachment({
                        type: 'video',
                        url: url
                    })
                );
            }
            
        }
    });

    function toString() {
        return text || '(no text)' +
            (attachments.length ? attachments.length + ' attachments' : '');
    }
    function toHTML() {
        var output = text || '';
        attachments.forEach(function (attachment) {;
            if (attachment.type == "video") {
                output += 
                    '<div>' +
                    '<video poster="' + attachment.posterUrl +
                        '" preload="auto" loop="loop" autoplay="autoplay">' +
                    attachment.sources.map(function (source) {
                        return '<source type="' + source.type + '" ' +
                            'src="' + source.url + '">';
                    }).join('') +
                    '</video' +
                    '</div>';
            } else if (attachment.type == "image") {
                output += 
                    '<div>' +
                    '<img src="' + attachment.url + '"/>' +
                    '</div>';
            }
        });
        output = output.autoLink({
            target: '_blank'
        });
        return output;
    }

    this.id = id;
    this.createdAt = createdAt;
    this.userId = userId;
    this.groupId = groupId;
    this.name = name;
    this.avatarUrl = avatarUrl;
    this.text = text;
    this.attachments = attachments;
    this.toString = toString;
    this.toHTML = toHTML;
}

function GroupMeNotification(messageObject, group) {
    var message = new GroupMeMessage(messageObject.subject);
    var id = message.id;
    var attachments = message.attachments;
    var notificationId = null;
    var unrenderTimeout = null;
    var children = [];

    function render() {
        clearTimeout(unrenderTimeout);
        var options = {
            type: 'basic',
            message: message.toString(),
            title: message.name || group.name,
            iconUrl: message.avatarUrl || group.image || 'icon.png'
        };
        groupMe.getCache(function (cache) {
            var notificationTimeout = cache.notificationTimeout || 10000;
            chrome.notifications.create(id, options, function (createdNotificationId) {
                notificationId = createdNotificationId;
                unrenderTimeout = setTimeout(function () {
                    unrender();
                }, notificationTimeout);
            });
        });
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
    function getMessage() {
        return message;
    }

    this.render = render;
    this.unrender = unrender;
    this.getNotificationId = getNotificationId;
    this.getGroupId = getGroupId;
    this.getMessage = getMessage;
}

function GroupMeNotifier(groupMe) {
    var client = null;
    var subscription = null;
    var groupCache = new GroupMeGroupCache(groupMe);
    var notifications = [];
    var events = new EventEmitter();

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
                    if (message.type == "line.create") {
                        events.trigger("show", message);
                        groupMe.getCache(function (cache) {
                            var showMessagesFromUser = cache.selfNotifications;
                            var showMessages = (showMessagesFromUser || message.subject.sender_id !== userId) &&
                                cache.enableNotifications;
                            if (showMessages) {
                                show(message);
                            }
                        });
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
    chrome.notifications.onClosed.addListener(function (notificationId, byUser) {
        var notification = notifications.filter(function (notification) {
            return String(notification.getNotificationId()) == String(notificationId);
        })[0];
        if (notification) {
            notification.unrender();
        }
    });
    this.start = start;
    this.stop = stop;
    this.events = events;
}

function GroupMe() {
    var authorizeUri = 'https://oauth.groupme.com/oauth/authorize?client_id=KRSKsn6m30Q8Bey31dBRxKsOBmtMMVQXowHdU1KsO8SinOPV';
    var oauthCallbackUri = 'https://s3-us-west-1.amazonaws.com/groupme-chrome/oauth_callback.html';
    var events = new EventEmitter();

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
            var data = options.data;
            $.ajax({
                url: baseApiUri + path,
                type: type,
                data: (type == 'get') ? data : JSON.stringify(options.data),
                contentType: "application/json",
                processData: (type == 'get') ? true : false,
                beforeSend: function (xhr) {
                    xhr.setRequestHeader('X-Access-Token', token);
                },
                success: function (data, status) {
                    if (!data && status === 'notmodified') {
                        return callback(null);
                    }
                    complete(data);
                },
                error: function (xhr, status, error) {
                    var data = JSON.parse(xhr.responseText);
                    complete(data);
                }
            });
        });
    }

    var popupTabId = null;

    function login(callback) {
        callback = callback || function () {};
        function onRemoved (tabId) {
            if (popupTabId === tabId) {
                popupTabId = null;
            }
        }
        function onUpdated (tabId, changeInfo, tab) {
            if (popupTabId == tabId) {
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

            chrome.tabs.get(popupTabId, function (tab) {
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

            function openPopup() {
                if (popupTabId === null) {
                    chrome.tabs.create({
                        url: authorizeUri
                    }, function (tab) {
                        popupTabId = tab.id;
                    })
                } else {
                    chrome.tabs.get(popupTabId, function (tab) {
                        if (!tab) {
                            popupTabId = null;
                            return openPopup();
                        }
                        chrome.windows.update(tab.windowId, {
                            "focused": true
                        });
                        chrome.tabs.update(popupTabId, {
                            active: true
                        });
                    });
                }
            }
            openPopup();
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
    this.events = events;

    var notifier = new GroupMeNotifier(this);
    notifier.events.on("show", function (message) {
        events.trigger("notifier:show", message);
    });
    notifier.start();

}
