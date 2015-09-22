$(function () {
  
  var statusFlashTimeout;
  function statusFlash(message) {
    clearTimeout(statusFlashTimeout);
    $('#status').show().text(message);
    statusFlashTimeout = setTimeout(function () {
      $('#status').hide();
    }, 10000);
  }

  function restoreOptions() {
    chrome.storage.sync.get({
      selfNotifications: false,
      notificationTimeout: 10000
    }, function (items) {
      var $form = $('form#options');
      var $selfNotifications = $form.find('[name="self_notifications"]');
      var $notificationTimeout = $form.find('[name="notification_timeout"]');
      $selfNotifications.prop('checked', items.selfNotifications);
      $notificationTimeout.val(parseInt(items.notificationTimeout, 10) / 1000);
    });
  }
  restoreOptions();

  function optionsFormSubmitHandler(event) {
    event.preventDefault();
    var $form = $(event.currentTarget);
    var $selfNotifications = $form.find('[name="self_notifications"]');
    var $notificationTimeout = $form.find('[name="notification_timeout"]');
    
    var newOptions = {
      selfNotifications: $selfNotifications.prop('checked'),
      notificationTimeout: parseInt($notificationTimeout.val(), 10) * 1000
    };
    chrome.storage.sync.set(newOptions, function () {
      statusFlash("Saved.");
    });
  }
  $('form#options').on('submit', optionsFormSubmitHandler);
});
