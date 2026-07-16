// Thin fetch wrapper against the public personal-baas HTTP API — no internal code, no SDK,
// exactly what a real third-party developer would write. One Authorization: Bearer header
// throughout (this project's actual auth model — no separate `apikey` header, unlike Supabase):
// the publishable (anon) key before login, the session's access token after.
(function (global) {
  'use strict';

  var STORAGE_KEY = 'todoapp.session';

  function loadSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(session) {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  var session = loadSession();

  function currentUser() {
    return session ? session.user : null;
  }

  function authHeader() {
    return 'Bearer ' + (session ? session.accessToken : global.APP_CONFIG.anonKey);
  }

  // PostgREST multi-schema project selection (Phase 9, scope.md §23): with more than one
  // project's schema configured in db-schemas, a request must say which one it means or
  // PostgREST resolves against whichever schema is listed first. Accept-Profile picks the
  // schema for reads (GET/HEAD), Content-Profile for writes (POST/PATCH/PUT/DELETE) — PostgREST
  // treats these as two separate headers rather than one, so pick the right one per method.
  function profileHeaderName(method) {
    return method === 'GET' || method === 'HEAD' ? 'Accept-Profile' : 'Content-Profile';
  }

  // Low-level request helper. Retries exactly once after a transparent token refresh on 401.
  // Body/Content-Type are prepared once; only the Authorization header is recomputed per
  // attempt, since a refresh in between attempts changes the current access token.
  function request(path, options) {
    options = options || {};
    var baseHeaders = Object.assign({}, options.headers || {});
    var body = options.body;
    var isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isFormData && typeof body !== 'string') {
      baseHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (path.indexOf('/rest/v1/') === 0) {
      baseHeaders[profileHeaderName(options.method || 'GET')] = global.APP_CONFIG.schemaName;
    }

    function attempt(allowRetry) {
      var headers = Object.assign({ Authorization: authHeader() }, baseHeaders);
      return fetch(
        global.APP_CONFIG.baseUrl + path,
        Object.assign({}, options, { headers: headers, body: body })
      ).then(function (res) {
        if (res.status === 401 && allowRetry && session && session.refreshToken) {
          return refreshSession().then(function (refreshed) {
            if (!refreshed) throw new Error('Session expired. Please log in again.');
            return attempt(false);
          });
        }
        return res;
      });
    }

    return attempt(true);
  }

  function parseJsonOrThrow(res) {
    return res.text().then(function (text) {
      var body = text ? JSON.parse(text) : null;
      if (!res.ok) {
        var message = (body && body.message) || res.statusText;
        throw new Error(Array.isArray(message) ? message.join(', ') : message);
      }
      return body;
    });
  }

  // --- Auth ---------------------------------------------------------------

  function signup(email, password) {
    return request('/auth/v1/signup', { method: 'POST', body: { email: email, password: password } })
      .then(parseJsonOrThrow);
  }

  function login(email, password) {
    return request('/auth/v1/login', { method: 'POST', body: { email: email, password: password } })
      .then(parseJsonOrThrow)
      .then(function (result) {
        session = {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        };
        saveSession(session);
        return result.user;
      });
  }

  function refreshSession() {
    if (!session || !session.refreshToken) return Promise.resolve(false);
    return fetch(global.APP_CONFIG.baseUrl + '/auth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
      .then(function (res) {
        if (!res.ok) {
          session = null;
          saveSession(null);
          return false;
        }
        return res.json().then(function (result) {
          session = {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            user: session.user,
          };
          saveSession(session);
          return true;
        });
      })
      .catch(function () {
        session = null;
        saveSession(null);
        return false;
      });
  }

  function logout() {
    return request('/auth/v1/logout', { method: 'POST' }).then(function () {
      session = null;
      saveSession(null);
    });
  }

  function restoreSession() {
    if (!session) return Promise.resolve(null);
    return request('/auth/v1/user', { method: 'GET' }).then(function (res) {
      if (!res.ok) {
        session = null;
        saveSession(null);
        return null;
      }
      return res.json().then(function (user) {
        session.user = user;
        saveSession(session);
        return user;
      });
    });
  }

  // --- Todos (/rest/v1/todos, RLS-scoped to the caller — no client-side user_id filtering) ---

  function listTodos() {
    return request('/rest/v1/todos?order=created_at.desc', { method: 'GET' }).then(parseJsonOrThrow);
  }

  function createTodo(title) {
    var user = currentUser();
    return request('/rest/v1/todos', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { title: title, user_id: user.id },
    })
      .then(parseJsonOrThrow)
      .then(function (rows) {
        return rows[0];
      });
  }

  function updateTodo(id, patch) {
    var body = Object.assign({}, patch, { updated_at: new Date().toISOString() });
    return request('/rest/v1/todos?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: body,
    })
      .then(parseJsonOrThrow)
      .then(function (rows) {
        return rows[0];
      });
  }

  function deleteTodo(id) {
    return request('/rest/v1/todos?id=eq.' + encodeURIComponent(id), { method: 'DELETE' }).then(
      function (res) {
        if (!res.ok) return parseJsonOrThrow(res);
      }
    );
  }

  // --- Storage (/storage/v1/object/todo-attachments/*path) ----------------

  var BUCKET = 'todo-attachments';

  function attachmentPath(todoId, filename) {
    return todoId + '/' + encodeURIComponent(filename);
  }

  function uploadAttachment(todoId, file) {
    var path = attachmentPath(todoId, file.name);
    var form = new FormData();
    form.append('file', file);
    return request('/storage/v1/object/' + BUCKET + '/' + path, { method: 'POST', body: form })
      .then(parseJsonOrThrow)
      .then(function () {
        return updateTodo(todoId, { attachment_path: path });
      });
  }

  function downloadAttachment(path, filename) {
    return request('/storage/v1/object/' + BUCKET + '/' + path, { method: 'GET' }).then(function (res) {
      if (!res.ok) return parseJsonOrThrow(res);
      return res.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
    });
  }

  function deleteAttachment(todoId, path) {
    return request('/storage/v1/object/' + BUCKET + '/' + path, { method: 'DELETE' })
      .then(function (res) {
        if (!res.ok) return parseJsonOrThrow(res);
      })
      .then(function () {
        return updateTodo(todoId, { attachment_path: null });
      });
  }

  global.Api = {
    currentUser: currentUser,
    isLoggedIn: function () {
      return !!session;
    },
    signup: signup,
    login: login,
    logout: logout,
    restoreSession: restoreSession,
    listTodos: listTodos,
    createTodo: createTodo,
    updateTodo: updateTodo,
    deleteTodo: deleteTodo,
    uploadAttachment: uploadAttachment,
    downloadAttachment: downloadAttachment,
    deleteAttachment: deleteAttachment,
  };
})(window);
