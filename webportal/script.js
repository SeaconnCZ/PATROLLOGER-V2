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
      // Tabulka všech žádostí
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

      // Návrhy na povýšení
      const promotionTbody = document.querySelector('#promotion-table tbody');
      promotionTbody.innerHTML = '';
      // Najdi uživatele s aspoň jedním úspěšným REDATem
      const rankOrder = [
        'Police Officer I Zk.doba',
        'Police Officer I',
        'Police Officer II',
        '⟩⟩│Police Officer III',
        '⋆⟩⟩│Police Officer III+1',
        '⟩⟩⟩│Sergeant I.',
        '⟨⟩⟩⟩│Sergeant II.',
        '❚│Lieutenant',
        '❚❚│Captain',
        '★│Commander',
        '★★│Deputy Chief',
        '★★★│Assistant of Chief',
        '★★★★│Chief of Police'
      ];
      // Map: userId -> {nickname, rank, count}
      const passedMap = {};
      Object.values(data).forEach(req => {
        if (req.status === 'done' && req.passed) {
          if (!passedMap[req.userId]) {
            passedMap[req.userId] = { nickname: req.nickname, rank: req.rank, count: 0 };
          }
          passedMap[req.userId].count++;
        }
      });
      Object.values(passedMap).forEach(user => {
        // Najdi index současné hodnosti
        const idx = rankOrder.indexOf(user.rank);
        if (idx !== -1 && idx < rankOrder.length - 1) {
          const newRank = rankOrder[idx + 1];
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${user.nickname}</td>
            <td>${user.rank}</td>
            <td>${newRank}</td>
          `;
          promotionTbody.appendChild(tr);
        }
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
