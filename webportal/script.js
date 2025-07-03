const API_URL = '/webportal/api/redat';
const PASSWORD = 'admin123'; // změň si na vlastní!

function login() {
  const pw = document.getElementById('password').value;
  if (pw === PASSWORD) {
    localStorage.setItem('redatAuth', '1');
    showMain();
  } else {
    document.getElementById('login-error').innerText = 'Špatné heslo!';
  }
}
function logout() {
  localStorage.removeItem('redatAuth');
  location.reload();
}
function showMain() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('main').style.display = 'block';
  loadTable();
}
function showLogin() {
  document.getElementById('login').style.display = 'block';
  document.getElementById('main').style.display = 'none';
}
function loadTable() {
  fetch(API_URL)
    .then(r => r.json())
    .then(data => {
      const tbody = document.querySelector('#redat-table tbody');
      tbody.innerHTML = '';
      Object.entries(data).forEach(([id, req]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${id}</td>
          <td>${req.nickname}</td>
          <td>${req.rank}</td>
          <td>${req.shift}</td>
          <td>${req.availability}</td>
          <td>${req.status}</td>
          <td>${req.claimedBy ? req.claimedBy : ''}</td>
          <td>
            <button onclick="changeStatus('${id}','claimed')">Claim</button>
            <button onclick="changeStatus('${id}','done')">Dokončit</button>
            <button onclick="changeStatus('${id}','cancelled')">Zrušit</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    });
}
function changeStatus(id, status) {
  fetch(API_URL + '/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status })
  }).then(() => loadTable());
}
// Init
if (localStorage.getItem('redatAuth') === '1') showMain();
else showLogin();
