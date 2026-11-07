const CATEGORIES = ['groceries', 'dinners', 'cleaning', 'utilities', 'rent', 'other'];

const state = { user: null, groups: [], groupId: null, members: [] };

const $ = (id) => document.getElementById(id);

// Sends a request to the server and always returns { ok, status, data }.
async function api(url, method = 'GET', body) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: { error: 'Cannot reach the server. Is it running?' } };
  }
}

function showMessage(text, type = 'error') {
  const box = $('message');
  box.textContent = text;
  box.className = 'message ' + type;
  box.hidden = false;
}

function clearMessage() {
  $('message').hidden = true;
}

function formatMoney(cents) {
  return (cents / 100).toFixed(2) + ' PLN';
}

function todayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Creates an element with safe text (never inserts user text as HTML).
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/* ---------- Screens ---------- */

function showAuth() {
  state.user = null;
  $('auth-view').hidden = false;
  $('app-view').hidden = true;
  $('user-box').hidden = true;
}

async function showApp(user) {
  state.user = user;
  $('auth-view').hidden = true;
  $('app-view').hidden = false;
  $('user-box').hidden = false;
  $('user-name').textContent = user.name;
  await loadGroups();
}

/* ---------- Groups ---------- */

async function loadGroups() {
  const result = await api('/api/groups');
  if (!result.ok) {
    return showMessage(result.data.error || 'Could not load groups.');
  }
  state.groups = result.data;
  renderGroups();

  const stillExists = state.groups.some((g) => g.id === state.groupId);
  if (!stillExists) {
    state.groupId = state.groups.length > 0 ? state.groups[0].id : null;
  }
  await selectGroup(state.groupId);
}

function renderGroups() {
  const list = $('group-list');
  list.replaceChildren();
  for (const group of state.groups) {
    const item = el('li');
    const button = el('button', group.name, group.id === state.groupId ? 'active' : '');
    button.type = 'button';
    button.addEventListener('click', () => selectGroup(group.id));
    item.appendChild(button);
    list.appendChild(item);
  }
}

async function selectGroup(groupId) {
  state.groupId = groupId;
  renderGroups();

  const hasGroup = groupId !== null;
  $('no-group').hidden = hasGroup;
  $('group-content').hidden = !hasGroup;
  if (!hasGroup) return;

  const group = state.groups.find((g) => g.id === groupId);
  $('group-title').textContent = group.name;

  const membersResult = await api('/api/groups/' + groupId + '/members');
  if (!membersResult.ok) {
    return showMessage(membersResult.data.error || 'Could not load members.');
  }
  state.members = membersResult.data;
  renderMembers();
  renderExpenseForm();
  await loadExpenses();
}

function renderMembers() {
  const list = $('member-list');
  list.replaceChildren();
  for (const member of state.members) {
    list.appendChild(el('li', member.name));
  }
}

/* ---------- Expense form ---------- */

function renderExpenseForm() {
  const category = $('expense-category');
  if (category.options.length === 0) {
    for (const name of CATEGORIES) {
      const option = el('option', capitalize(name));
      option.value = name;
      category.appendChild(option);
    }
  }

  $('expense-date').value = todayString();

  const paidBy = $('expense-paid-by');
  paidBy.replaceChildren();
  for (const member of state.members) {
    const option = el('option', member.name);
    option.value = member.id;
    if (member.id === state.user.id) option.selected = true;
    paidBy.appendChild(option);
  }

  const split = $('expense-split');
  split.replaceChildren();
  for (const member of state.members) {
    const label = el('label');
    const box = el('input');
    box.type = 'checkbox';
    box.value = member.id;
    box.checked = true;
    label.appendChild(box);
    label.appendChild(document.createTextNode(member.name));
    split.appendChild(label);
  }
}

/* ---------- Expense list ---------- */

async function loadExpenses() {
  const result = await api('/api/groups/' + state.groupId + '/expenses');
  if (!result.ok) {
    return showMessage(result.data.error || 'Could not load expenses.');
  }
  renderExpenses(result.data);
}

function renderExpenses(expenses) {
  const body = $('expense-body');
  body.replaceChildren();

  $('no-expenses').hidden = expenses.length > 0;
  $('expense-table').hidden = expenses.length === 0;

  for (const expense of expenses) {
    const row = el('tr');
    row.appendChild(el('td', expense.date));
    row.appendChild(el('td', expense.description || '-', 'wrap'));
    row.appendChild(el('td', capitalize(expense.category)));
    row.appendChild(el('td', expense.paid_by_name));
    row.appendChild(el('td', formatMoney(expense.amount_cents), 'num'));
    row.appendChild(el('td', expense.shared_with || '-', 'wrap'));
    body.appendChild(row);
  }
}

/* ---------- Event handlers ---------- */

function setAuthTab(tab) {
  const isLogin = tab === 'login';
  $('login-form').hidden = !isLogin;
  $('register-form').hidden = isLogin;
  $('tab-login').classList.toggle('active', isLogin);
  $('tab-register').classList.toggle('active', !isLogin);
  clearMessage();
}

$('tab-login').addEventListener('click', () => setAuthTab('login'));
$('tab-register').addEventListener('click', () => setAuthTab('register'));

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();
  const result = await api('/api/login', 'POST', {
    email: $('login-email').value,
    password: $('login-password').value,
  });
  if (!result.ok) {
    return showMessage(result.data.error || 'Could not log in.');
  }
  $('login-form').reset();
  await showApp(result.data);
});

$('register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();
  const result = await api('/api/register', 'POST', {
    name: $('register-name').value,
    email: $('register-email').value,
    password: $('register-password').value,
  });
  if (!result.ok) {
    return showMessage(result.data.error || 'Could not register.');
  }
  $('register-form').reset();
  await showApp(result.data);
});

$('logout-btn').addEventListener('click', async () => {
  await api('/api/logout', 'POST', {});
  state.groups = [];
  state.groupId = null;
  state.members = [];
  clearMessage();
  showAuth();
});

$('group-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();
  const result = await api('/api/groups', 'POST', { name: $('group-name').value });
  if (!result.ok) {
    return showMessage(result.data.error || 'Could not create the group.');
  }
  $('group-form').reset();
  state.groupId = result.data.id;
  await loadGroups();
});

$('member-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();
  const result = await api('/api/groups/' + state.groupId + '/members', 'POST', {
    email: $('member-email').value,
  });
  if (!result.ok) {
    return showMessage(result.data.error || 'Could not add the roommate.');
  }
  $('member-form').reset();
  showMessage(result.data.name + ' was added to the group.', 'ok');
  await selectGroup(state.groupId);
});

$('expense-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessage();

  const splitBetween = Array.from($('expense-split').querySelectorAll('input:checked')).map((box) =>
    Number(box.value)
  );

  const result = await api('/api/groups/' + state.groupId + '/expenses', 'POST', {
    description: $('expense-description').value,
    amount: $('expense-amount').value,
    category: $('expense-category').value,
    date: $('expense-date').value,
    paidBy: Number($('expense-paid-by').value),
    splitBetween: splitBetween,
  });
  if (!result.ok) {
    return showMessage(result.data.error || 'Could not save the expense.');
  }

  $('expense-description').value = '';
  $('expense-amount').value = '';
  showMessage('Expense saved.', 'ok');
  await loadExpenses();
});

/* ---------- Start ---------- */

(async function init() {
  setAuthTab('login');
  const result = await api('/api/me');
  if (result.ok) {
    await showApp(result.data);
  } else {
    showAuth();
  }
})();