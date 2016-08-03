var backgroundPage = chrome.extension.getBackgroundPage();
chrome.runtime.connect({name: backgroundPage.popupPortName});

$(window).on('load', function () {
    var groupMe = backgroundPage.groupMe;
    var GroupMeMessage = backgroundPage.GroupMeMessage;

    function infoRender(message) {
        $('#info').removeClass('hidden')
            .find('.info-message')
            .text(message);
        setTimeout(function () {
            $('#info').addClass('hidden');
        }, 1000);
    }

    function errorRender(error) {
        $('#error').removeClass('hidden')
            .find('.error-message')
            .text("Error: " + error.message);
        setTimeout(function () {
            $('#error').addClass('hidden');
        }, 1000);
    }


    function loginRender() {
        $('#login').removeClass('hidden');
        $('#login .error-message').addClass('hidden');
        $('#login .login-token-form').addClass('hidden');
        if (groupMe.loginProgress.error) {
            $('#login .error-message')
                .text(groupMe.loginProgress.error)
                .removeClass('hidden');
            $('#login .login-token-form')
                .removeClass('hidden');
        }
    }
    function loginClickHandler(event) {
        event.preventDefault();
        groupMe.login(function (error) {
            if (error) {
                $('#error').text("Couldn't log in. " + error.message).removeClass('hidden');
                return;
            }
            render();
        });
    }
    $('#login .login-login').on('click', loginClickHandler);
    function loginTokenSubmit(event) {
        event.preventDefault();
        var token = $('#login .login-token-form input').val();
        groupMe.loginToken(token, function (error) {
            if (error) {
                $('#error').text("Couldn't log in. " + error.message).removeClass('hidden');
                return;
            }
            render();
        });
    }
    $('#login .login-token-form').on('submit', loginTokenSubmit);


    function loggedInRender() {
        $('#logged-in').removeClass('hidden');
    }
    function loggedInLogoutButtonClickHandler(event) {
        event.preventDefault();
        groupMe.logout(function () {
            render();
        });
    }
    $('#logged-in').on('click', '.logged-in-logout', loggedInLogoutButtonClickHandler);


    var selectGroupRenderTimeout = null;
    function selectGroupRender() {
        if (selectGroupRenderTimeout) {
            clearTimeout(selectGroupRenderTimeout);
        }
        var $selectGroup = $('#select-group');
        $selectGroup.find('ul li').remove();
        $selectGroup.find('ul').append('<li>Loading...</li>');
        $('#select-group').removeClass('hidden');
        groupMe.api('/groups', function (error, groups) {
            if (error) {
                errorRender("Error loading groups: " + error.message +
                    "Trying again in 1 second.");
                setTimeout(function () {
                    selectGroupRender();
                }, 1000);
                return;
            }
            $selectGroup.find('ul li').remove();
            groups.forEach(function (group) {
                var $group = $('<li>');
                $group.append(
                        $('<a class="select" href="#">' + group.name + '</a>')
                        .data({
                            "groupId": group.id,
                            "groupName": group.name
                        })
                    );
                $group.append(
                        $('<a class="search" href="#">search</a>')
                        .data({
                            "groupId": group.id,
                            "groupName": group.name
                        })
                    );
                $selectGroup.find('ul').append($group);
            });
        });
    }
    function selectGroupSelectChange(event) {
        event.preventDefault();
        event.stopPropagation();
        var $selectGroup = $('#select-group');
        var $button = $(event.currentTarget);
        var groupId = $button.data("groupId");
        var groupName = $button.data("groupName");
        if (!groupId) {
            errorRender("No group associated with item");
            return;
        }
        groupMe.setCache({
            groupId: groupId,
            groupName: groupName
        }, function () {
            render();
        });
    }
    $('#select-group').on('click', 'a.select', selectGroupSelectChange);

    function selectGroupSearch(event) {
        event.preventDefault();
        event.stopPropagation();
        var $button = $(event.currentTarget);
        var groupId = $button.data("groupId");
        var groupName = $button.data("groupName");
        if (!groupId) {
            errorRender("No group associated with item");
            return;
        }
        groupMe.setCache({
            groupId: groupId,
            groupName: groupName,
            groupSearch: true
        }, function () {
            render();
        });
    }
    $('#select-group').on('click', 'a.search', selectGroupSearch);


    function selectedGroupRender() {
        $('#selected-group').removeClass('hidden');
        groupMe.getCache(function (cache) {
            var groupName = cache.groupName;
            var groupId = cache.groupId;
            var groupUri = "https://app.groupme.com/chats/" + groupId;
            $('#selected-group .selected-group-uri').attr("href", groupUri);
            $('#selected-group .selected-group-name').text(groupName);
        });
    }
    function selectedGroupRemoveButtonClickHandler(event) {
        event.preventDefault();
        groupMe.setCache({
            groupId: null,
            groupName: null
        }, function () {
            render();
        });
    }
    function selectedGroupUriClickHandler(event) {
        event.preventDefault();
        var $link = $(event.currentTarget);
        var uri = $link.attr("href");
        chrome.tabs.query({
            "url": "https://app.groupme.com/*"
        }, function (tabs) {
            if (tabs.length > 0) {
                var matchedTab = tabs[0];
                chrome.windows.update(matchedTab.windowId, {
                    "focused": true
                });
                chrome.tabs.update(matchedTab.id, {
                    "active": true,
                    "url": (matchedTab.url == uri) ? undefined : uri
                });
            } else {
                chrome.tabs.create({
                    url: uri
                });
            }
        });
    }
    $('#selected-group').on('click', '.selected-group-remove', selectedGroupRemoveButtonClickHandler);
    $('#selected-group').on('click', '.selected-group-uri', selectedGroupUriClickHandler);
    function selectedGroupShareCurrentPageButtonClickHandler(event) {
        event.preventDefault();
        event.stopPropagation();
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            var tab = tabs[0];
            postMessage(tab.url);
        });
    }
    $('#selected-group .selected-group-share-current-page-button')
        .on('click', selectedGroupShareCurrentPageButtonClickHandler);

    function searchMessageRender() {
        $('#search-message').removeClass('hidden');
        $('#search-message .message-list li').remove();
        groupMe.getCache(function (cache) {
            if (cache.groupSearch === true) {
                searchMessageRenderTerm();
            } else {
                searchMessageRenderMessages();
            }
        });
    }
    
    function searchMessageRenderTerm() {
        groupMe.getCache(function (cache) {
            var $form = $(
                '<form>' +
                '<input type="text" name="search" placeholder="Enter search term" />' +
                '<button type="submit">Search</button>' +
                '<a href="#" class="cancel">cancel</a>' +
                '</form>');
            $form.on('click', 'a.cancel', function (event) {
                event.preventDefault();
                groupMe.setCache({
                    groupSearch: false
                }, function () {
                    render();
                });
            });
            $form.on('submit', function (event) {
                event.preventDefault();
                var $input = $form.find('input[name="search"]');
                var searchTerm = $input.val();
                groupMe.setCache({
                    groupSearch: searchTerm
                }, function () {
                    render();
                });
            });
            var $container = $('<li></li>');
            $container.append($form);
            $('#search-message .message-list').append($container);
        });
    }

    var searchMessageRequest;
    function searchMessageRenderMessages() {
        groupMe.getCache(function (cache) {
            function addMessage(message) {
                var groupMeMessage = new GroupMeMessage(message);
                var defaultAvatarUrl = chrome.extension.getURL('default-contact-icon.png');
                var $author = $('<span class="message-list-author">')
                    .append(
                        $('<img class="message-list-author-avatar">')
                        .attr('src', groupMeMessage.avatarUrl || defaultAvatarUrl)
                        .attr('title', groupMeMessage.name)
                    );
                var $message = $('<div class="message-list-message">')
                        .append(groupMeMessage.toHTML());
                var $container = $('<li>');
                $container.append($author);
                $container.append($message);
                $('#search-message .message-list').append($container);
            }
            
            var $status = $('<li class="status">Searching... <a href="#">abort</a></li>');
            searchMessageRequest = groupMe.searchText(cache.groupSearch, function (e, messages) {
                for (var i = 0; i < messages.length; i++) {
                    addMessage(messages[i]);
                }
                if (searchMessageRequest.done) {
                    $status.html('Finished. <a href="#">cancel</a>');
                }
            });
            $('#search-message .message-list').append($status);
        });
    }
    $('#search-message .message-list').on('click', '.status a', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (searchMessageRequest && !searchMessageRequest.done) {
            searchMessageRequest.abort();
        } else {
            groupMe.setCache({
                groupSearch: false
            }, function () {
                $('#search-message .message-list li').remove();
                render();
            });
        }
    });

    function postMessageRender() {
        $('#post-message').removeClass('hidden');
        $('#post-message textarea').focus();
        $('#post-message .message-list li:not(.message-list-more-container)').remove();
        $('#post-message .message-list li.message-list-more-container').addClass('hidden');
        postMessageRenderMessages();
    }
    var cachedMessagesGroupId = null;
    var cachedMessages = [];
    function getMessages(options, callback) {
        if (callback === undefined) {
            callback = options;
            options = {};
        }
        options = options || {};
        var getEarlier = options.getEarlier;

        groupMe.getCache(function (cache) {
            var groupId = cache.groupId;
            if (!groupId) {
                var error = new Error('no group id');
                error.type = 'nogroupid';
                return callback(error);
            }
            if (groupId !== cachedMessagesGroupId) {
                cachedMessages = [];
            }
            cachedMessagesGroupId = groupId;
            var latestMessage = cachedMessages[0];
            var earliestMessage = cachedMessages[cachedMessages.length - 1];

            var beforeId;
            var sinceId;
            if (getEarlier && earliestMessage) {
                beforeId = earliestMessage.id;
            } else if (latestMessage) {
                sinceId = latestMessage.id;
            }
            groupMe.api('/groups/' + groupId + '/messages', {
                data: {
                    before_id: beforeId,
                    since_id: sinceId
                }
            }, function (error, messageResponse) {
                if (error) {
                    return callback(error);
                }
                if (messageResponse) {
                    var messages = messageResponse.messages;
                    messages.sort(function (a, b) {
                        if (a.created_at > b.created_at) {
                            return -1;
                        } else if (a.created_at < b.created_at) {
                            return 1;
                        }
                        return 0;
                    });
                    if (getEarlier) {
                        cachedMessages = cachedMessages.concat(messages);
                    } else {
                        cachedMessages = messages.concat(cachedMessages);
                    }
                } else {
                    cachedMessages.noMore = true;
                }
                callback(null, cachedMessages);
            });
        });
    }
    var postMessageRenderMessagesTimeout = null;
    function postMessageRenderMessages(options) {
        options = options || {};
        clearTimeout(postMessageRenderMessagesTimeout);
        getMessages(options, function (error, messages) {
            if (error && error.type == 'nogroupid') {
                return;
            }
            if (error) {
                postMessageRenderMessagesTimeout = setTimeout(function () {
                    postMessageRenderMessages(options);
                }, 1000);
                errorRender(error);
                infoRender("Couldn't load messages, trying again in 1 second...");
                return;
            }
            var $messagesUl = $('#post-message .message-list');
            $messagesUl.find('li:not(.message-list-more-container)').remove();
            messages.forEach(function (message, index) {
                var lastMessage = messages[index-1];
                var lastGroupMeMessage = lastMessage && (new GroupMeMessage(lastMessage));
                var groupMeMessage = new GroupMeMessage(message);
                var defaultAvatarUrl = chrome.extension.getURL('default-contact-icon.png');
                var $author = $('<span class="message-list-author">')
                    .append(
                        $('<img class="message-list-author-avatar">')
                        .attr('src', groupMeMessage.avatarUrl || defaultAvatarUrl)
                        .attr('title', groupMeMessage.name)
                    );

                var $container = $('<li>').append($author);
                var $message = $('<div class="message-list-message">')
                        .append(groupMeMessage.toHTML());
                
                if (lastGroupMeMessage && lastGroupMeMessage.userId == groupMeMessage.userId) {
                    $container = $messagesUl.find('li:last-child');
                } else {
                    $messagesUl.append($container);
                }
                $container.append($message);
            });
            var $noMoreContainer = $messagesUl.find('li.message-list-more-container');
            $noMoreContainer.appendTo($messagesUl);
            if (messages.noMore) {
                $noMoreContainer.addClass("hidden");
            } else {
                $noMoreContainer.removeClass("hidden");
            }
        });
    }
    function postMessage(message) {
        var $form = $('#post-message form');
        if (!message) {
            return errorRender(new Error("Message is required. Otherwise what the crap am I supposed to do?"));
        }
        groupMe.getCache(function (cache) {
            var groupId = cache.groupId;
            if (!groupId) {
                return errorRender(new Error("No group set. How did you get here?"));
            }
            groupMe.api('/groups/' + groupId + '/messages', {
                type: 'post',
                data: {
                    message: {
                        text: message
                    }
                }
            }, function (error) {
                if (error) {
                    return errorRender(error);
                }
                infoRender("Successfully posted!");
                $form.find('[name=message]').val('');
            });
        });
    }
    var isShiftKeyPressed = false;
    var ENTER = 13;
    var SHIFT = 16;
    function postMessageTextareaKeydownHandler(event) {
        if (event.which == SHIFT) {
            isShiftKeyPressed = true;
        }
        if (event.which == ENTER && !isShiftKeyPressed) {
            event.preventDefault();
            $('#post-message form').submit();
        }
    }
    function postMessageTextareaKeyupHandler(event) {
        if (event.which == SHIFT) {
            isShiftKeyPressed = false;
        }
    }
    $('#post-message form textarea').on('keydown', postMessageTextareaKeydownHandler);
    $('#post-message form textarea').on('keyup', postMessageTextareaKeyupHandler);
    function postMessageFormHandler(event) {
        event.preventDefault();
        var $form = $('#post-message form');
        var message = $form.find('[name=message]').val();
        postMessage(message);
    }
    $('#post-message form').on('submit', postMessageFormHandler);
    function postMessageMoreHandler(event) {
        event.preventDefault();
        postMessageRenderMessages({ getEarlier: true });
    }
    $('#post-message .message-list-more-button').on('click', postMessageMoreHandler);

    function render() {
        $('#login, #logged-in, #select-group, #selected-group, #post-message, #search-message').addClass('hidden');
        groupMe.getCache(function (cache) {
            if (!cache.token) {
                loginRender();
                return;
            }
            loggedInRender();
            if (!cache.groupId) {
                selectGroupRender();
                return;
            }
            selectedGroupRender();
            if (cache.groupSearch) {
                searchMessageRender();
            } else {
                postMessageRender();
            }
        });
    }
    groupMe.events.on("notifier:show", function () {
        postMessageRenderMessages();
    });
    render();
});
