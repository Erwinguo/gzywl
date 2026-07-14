(function () {
  var loginView = document.getElementById('login_view');
  var messagesView = document.getElementById('messages_view');
  var status = document.getElementById('login_status');
  var form = document.getElementById('login_form');
  var button = form.querySelector('button');

  function showMessages(messages) {
    loginView.hidden = true; messagesView.hidden = false;
    document.getElementById('count').textContent = '共 ' + messages.length + ' 条留言';
    var box = document.getElementById('messages');
    if (!messages.length) { box.innerHTML = '<div class="empty">暂时还没有留言</div>'; return; }
    box.innerHTML = messages.map(function (item) {
      var name = escapeHtml(item.firstName + ' ' + item.lastName);
      return '<article class="message-card"><div class="message-meta"><span>' + formatDate(item.createdAt) + '</span><span>' + name + '</span></div><h2><a href="mailto:' + encodeURIComponent(item.email) + '">' + escapeHtml(item.email) + '</a></h2><p>' + (item.phone ? '电话：' + escapeHtml(item.phone) : '') + '</p><div class="message-text">' + escapeHtml(item.message) + '</div></article>';
    }).join('');
  }
  function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]); }); }
  function formatDate(value) { var date = new Date(value); return isNaN(date) ? value : date.toLocaleString('zh-CN'); }
  function loadMessages() { return fetch('/api/admin/messages', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('登录状态已失效'); return r.json(); }).then(function (data) { showMessages(data.messages); }); }
  fetch('/api/admin/session').then(function (r) { return r.json(); }).then(function (data) { if (data.authenticated) loadMessages(); });
  form.addEventListener('submit', function (event) {
    event.preventDefault(); button.disabled = true; status.textContent = '';
    fetch('/api/admin/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username: form.username.value, password: form.password.value }) })
      .then(function (r) { return r.json().then(function (data) { if (!r.ok) throw new Error(data.error); return data; }); })
      .then(loadMessages).catch(function (error) { status.textContent = error.message; }).finally(function () { button.disabled = false; });
  });
  document.getElementById('logout_btn').addEventListener('click', function () { fetch('/api/admin/logout', { method: 'POST' }).then(function () { location.reload(); }); });
}());
