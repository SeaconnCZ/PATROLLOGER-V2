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

      // Nová tabulka návrhů na povýšení
      const promotionTbody = document.querySelector('#promotion-table tbody');
      promotionTbody.innerHTML = '';
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
      const userMap = {};
      Object.values(data).forEach(req => {
        if (!userMap[req.userId]) {
          userMap[req.userId] = { nickname: req.nickname, rank: req.rank, count: 0 };
        }
        if (req.status === 'done' && req.passed) {
          userMap[req.userId].count++;
        }
      });
      Object.values(userMap).forEach(user => {
        const idx = rankOrder.indexOf(user.rank);
        let newRank = '';
        let eligible = false;
        if (idx !== -1 && idx < rankOrder.length - 1 && user.count > 0) {
          newRank = rankOrder[idx + 1];
          eligible = true;
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${user.nickname}</td>
          <td>${user.rank}</td>
          <td style="text-align:center;">${user.count}</td>
          <td style="text-align:center; font-weight:bold; color:${eligible ? '#21e6c1' : '#e74c3c'};">
            ${eligible ? 'ANO' : 'NE'}
          </td>
          <td>${eligible ? newRank : ''}</td>
        `;
        if (eligible) tr.style.background = 'rgba(33,230,193,0.10)';
        promotionTbody.appendChild(tr);
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
