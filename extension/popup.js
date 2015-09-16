$(window).on('load', function () {
    var backgroundPage = chrome.extension.getBackgroundPage();
    var groupMe = backgroundPage.groupMe;

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


    function selectGroupRender() {
        $('#select-group').removeClass('hidden');
        groupMe.api('/groups', function (error, groups) {
            var $selectGroupUl = $('#select-group ul');
            $selectGroupUl.empty();
            
            if (error) {
                $selectGroupUl.append('<li>Error loading groups: ' + error.message + '</li>');
                return;
            }
            groups.forEach(function (group) {
                $selectGroupUl.append(
                    $('<li>')
                    .append(
                        $('<a href="#">')
                        .text(group.name)
                        .data("group", group)
                    )
                );
            });
        });
    }
    function selectGroupItemClick(event) {
        event.preventDefault();
        var $item = $(event.currentTarget);
        var group = $item.data('group');
        if (!group) {
            $('#error').text("No group associated with item");
            return;
        }
        groupMe.setCache({
            groupId: group.id,
            groupName: group.name
        }, function () {
            render();
        });
    }
    $('#select-group ul').on('click', 'li>a', selectGroupItemClick);


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


    function postMessageRender() {
        $('#post-message').removeClass('hidden');
        $('#post-message textarea').focus();
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
    function postMessageFormHandler(event) {
        event.preventDefault();
        var $form = $('#post-message form');
        var message = $form.find('[name=message]').val();
        postMessage(message);
    }
    $('#post-message form').on('submit', postMessageFormHandler);
    function postMessageCurrentPageClickHandler(event) {
        event.preventDefault();
        event.stopPropagation();
        chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
            var tab = tabs[0];
            postMessage(tab.url);
        });
    }
    $('#post-message #post-message-current-page-button')
        .on('click', postMessageCurrentPageClickHandler);

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
    render();
    document.activeElement.blur();
});
