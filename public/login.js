const form = document.getElementById('loginForm');
const error = document.getElementById('loginError');
const submit = document.getElementById('loginSubmit');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Entrando…';
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.assign(next && next.startsWith('/') ? next : '/');
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Entrar';
  }
});
