$(window).on('load', function () {
    var backgroundPage = chrome.extension.getBackgroundPage();
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
        $('#select-group').removeClass('hidden');
        groupMe.api('/groups', function (error, groups) {
            var $selectGroupSelect = $('#select-group select');
            $selectGroupSelect.find('option')
                .filter(function (index, option) {
                    return option.value !== "";
                })
                .remove();
            
            if (error) {
                errorRender("Error loading groups: " + error.message +
                    "Trying again in 1 second.");
                setTimeout(function () {
                    selectGroupRender();
                }, 1000);
                return;
            }
            groups.forEach(function (group) {
                $selectGroupSelect.append(
                    $('<option>')
                    .val(group.id)
                    .text(group.name)
                );
            });
        });
    }
    function selectGroupSelectChange(event) {
        event.preventDefault();
        event.stopPropagation();
        var $selectGroupSelect = $('#select-group select');
        var $selectedOption = $selectGroupSelect.find('option:selected');
        var groupId = $selectedOption.val();
        var groupName = $selectedOption.text();
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
    $('#select-group select').on('change', selectGroupSelectChange);


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


    function postMessageRender() {
        $('#post-message').removeClass('hidden');
        $('#post-message textarea').focus();
        postMessageRenderMessages();
    }
    var postMessageRenderMessagesTimeout = null;
    function postMessageRenderMessages() {
        clearTimeout(postMessageRenderMessagesTimeout);
        groupMe.getCache(function (cache) {
            var groupId = cache.groupId;
            if (!groupId) {
                return;
            }
            groupMe.api('/groups/' + groupId + '/messages', function (error, messageResponse) {
                if (error) {
                    postMessageRenderMessagesTimeout = setTimeout(function () {
                        postMessageRenderMessages();
                    }, 1000);
                    errorRender(error);
                    infoRender("Couldn't load messages, trying again in 1 second...");
                    return;
                }
                var messages = messageResponse.messages;
                messages.sort(function (a, b) {
                    if (a.created_at > b.created_at) {
                        return -1;
                    } else if (a.created_at < b.created_at) {
                        return 1;
                    }
                    return 0;
                });
                var $messagesUl = $('#post-message .post-message-message-list');
                $messagesUl.find('li').remove();
                messages = messages.slice(0, 5);
                messages.forEach(function (message) {
                    var groupMeMessage = new GroupMeMessage(message);
                    $messagesUl.append(
                        $('<li>')
                            .append(
                                $('<span class="post-messsage-list-author">').text(groupMeMessage.name)
                            )
                            .append(groupMeMessage.toHTML())
                    );
                });
            });
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

    function render() {
        $('#login, #logged-in, #select-group, #selected-group, #post-message').addClass('hidden');
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
            postMessageRender();
        });
    }
    groupMe.events.on("notifier:show", postMessageRenderMessages);
    render();
});
