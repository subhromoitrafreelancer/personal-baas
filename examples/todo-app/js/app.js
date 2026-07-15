// jQuery UI wiring for the todo-app example. Talks only to window.Api (js/api.js) — no direct
// fetch calls here, all HTTP lives in api.js.
$(function () {
  var $authView = $('#auth-view');
  var $appView = $('#app-view');
  var $authError = $('#auth-error');
  var $appError = $('#app-error');
  var $currentUserEmail = $('#current-user-email');
  var $todoList = $('#todo-list');

  function showError($el, err) {
    $el.text(err && err.message ? err.message : String(err)).show();
  }

  function clearError($el) {
    $el.hide().text('');
  }

  function showAuthView() {
    $appView.hide();
    $authView.show();
  }

  function showAppView() {
    var user = Api.currentUser();
    $currentUserEmail.text(user ? user.email : '');
    $authView.hide();
    $appView.show();
    loadTodos();
  }

  function filenameFromPath(path) {
    return decodeURIComponent(path.split('/').slice(1).join('/'));
  }

  function renderTodo(todo) {
    var $li = $('<li class="todo-item">').attr('data-id', todo.id).data('attachmentPath', todo.attachment_path || null);

    var $checkbox = $('<input type="checkbox" class="todo-done">').prop('checked', todo.done);
    var $title = $('<span class="todo-title">').text(todo.title);
    if (todo.done) $title.addClass('done');

    var $attachments = $('<span class="todo-attachments">');
    if (todo.attachment_path) {
      var filename = filenameFromPath(todo.attachment_path);
      $('<button type="button" class="todo-download">').text('Download ' + filename).appendTo($attachments);
      $('<button type="button" class="todo-remove-attachment">').text('Remove file').appendTo($attachments);
    } else {
      $('<input type="file" class="todo-attach-input">').appendTo($attachments);
    }

    var $delete = $('<button type="button" class="todo-delete">').text('Delete');

    $li.append($checkbox, $title, $attachments, $delete);
    return $li;
  }

  function loadTodos() {
    clearError($appError);
    Api.listTodos()
      .then(function (todos) {
        $todoList.empty();
        todos.forEach(function (todo) {
          $todoList.append(renderTodo(todo));
        });
      })
      .catch(function (err) {
        showError($appError, err);
      });
  }

  // --- Auth view -----------------------------------------------------------

  $('#show-register').on('click', function (e) {
    e.preventDefault();
    clearError($authError);
    $('#login-form').hide();
    $('#register-form').show();
  });

  $('#show-login').on('click', function (e) {
    e.preventDefault();
    clearError($authError);
    $('#register-form').hide();
    $('#login-form').show();
  });

  $('#register-form').on('submit', function (e) {
    e.preventDefault();
    clearError($authError);
    var email = $('#register-email').val();
    var password = $('#register-password').val();
    Api.signup(email, password)
      .then(function () {
        $('#register-form').hide();
        $('#login-form').show();
        $('#login-email').val(email);
        $('#login-password').val('').focus();
      })
      .catch(function (err) {
        showError($authError, err);
      });
  });

  $('#login-form').on('submit', function (e) {
    e.preventDefault();
    clearError($authError);
    var email = $('#login-email').val();
    var password = $('#login-password').val();
    Api.login(email, password)
      .then(function () {
        $('#login-form')[0].reset();
        showAppView();
      })
      .catch(function (err) {
        showError($authError, err);
      });
  });

  $('#logout-btn').on('click', function () {
    Api.logout().then(showAuthView).catch(function (err) {
      showError($appError, err);
    });
  });

  // --- Todo list -------------------------------------------------------------

  $('#new-todo-form').on('submit', function (e) {
    e.preventDefault();
    clearError($appError);
    var $input = $('#new-todo-title');
    var title = $input.val().trim();
    if (!title) return;
    Api.createTodo(title)
      .then(function (todo) {
        $todoList.prepend(renderTodo(todo));
        $input.val('').focus();
      })
      .catch(function (err) {
        showError($appError, err);
      });
  });

  $todoList.on('change', '.todo-done', function () {
    clearError($appError);
    var $li = $(this).closest('.todo-item');
    var id = $li.data('id');
    var done = $(this).is(':checked');
    Api.updateTodo(id, { done: done })
      .then(function () {
        $li.find('.todo-title').toggleClass('done', done);
      })
      .catch(function (err) {
        showError($appError, err);
      });
  });

  $todoList.on('click', '.todo-delete', function () {
    clearError($appError);
    var $li = $(this).closest('.todo-item');
    var id = $li.data('id');
    var attachmentPath = $li.data('attachmentPath');
    if (!window.confirm('Delete this todo?')) return;

    var cleanup = attachmentPath ? Api.deleteAttachment(id, attachmentPath) : Promise.resolve();
    cleanup
      .then(function () {
        return Api.deleteTodo(id);
      })
      .then(function () {
        $li.remove();
      })
      .catch(function (err) {
        showError($appError, err);
      });
  });

  $todoList.on('change', '.todo-attach-input', function () {
    clearError($appError);
    var $li = $(this).closest('.todo-item');
    var id = $li.data('id');
    var file = this.files[0];
    if (!file) return;
    Api.uploadAttachment(id, file)
      .then(function (todo) {
        $li.replaceWith(renderTodo(todo));
      })
      .catch(function (err) {
        showError($appError, err);
      });
  });

  $todoList.on('click', '.todo-download', function () {
    clearError($appError);
    var $li = $(this).closest('.todo-item');
    var attachmentPath = $li.data('attachmentPath');
    Api.downloadAttachment(attachmentPath, filenameFromPath(attachmentPath)).catch(function (err) {
      showError($appError, err);
    });
  });

  $todoList.on('click', '.todo-remove-attachment', function () {
    clearError($appError);
    var $li = $(this).closest('.todo-item');
    var id = $li.data('id');
    var attachmentPath = $li.data('attachmentPath');
    Api.deleteAttachment(id, attachmentPath)
      .then(function (todo) {
        $li.replaceWith(renderTodo(todo));
      })
      .catch(function (err) {
        showError($appError, err);
      });
  });

  // --- Boot ------------------------------------------------------------------

  if (Api.isLoggedIn()) {
    Api.restoreSession().then(function (user) {
      if (user) {
        showAppView();
      } else {
        showAuthView();
      }
    });
  } else {
    showAuthView();
  }
});
