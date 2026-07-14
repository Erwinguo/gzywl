(function () {
  'use strict';

  var form = document.querySelector('.getin_form');
  if (!form) return;

  var question = document.getElementById('captcha_question');
  var token = document.getElementById('captcha_token');
  var status = document.getElementById('form_status');
  var submit = document.getElementById('submit_btn');

  function setStatus(message, type) {
    status.textContent = message;
    status.className = 'form-status ' + (type || '');
  }

  function loadCaptcha() {
    question.textContent = '正在获取验证码…';
    fetch('/api/captcha', { cache: 'no-store' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        question.textContent = data.question;
        token.value = data.token;
      })
      .catch(function () { question.textContent = '验证码服务暂不可用'; });
  }

  document.getElementById('refresh_captcha').addEventListener('click', loadCaptcha);
  loadCaptcha();

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    submit.disabled = true;
    setStatus('正在提交…');
    var payload = {};
    new FormData(form).forEach(function (value, key) { payload[key] = value; });
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response.json().then(function (data) { return { ok: response.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) throw new Error(result.data.error || '提交失败');
        setStatus('留言已提交，我们会尽快联系您。', 'success');
        form.reset();
        loadCaptcha();
      })
      .catch(function (error) { setStatus(error.message, 'error'); loadCaptcha(); })
      .finally(function () { submit.disabled = false; });
  });
}());
