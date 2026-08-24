document.addEventListener('DOMContentLoaded', () => {
  // Auth DOM Elements
  const authOverlay = document.getElementById('authOverlay');
  const appContainer = document.getElementById('appContainer');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginError = document.getElementById('loginError');
  const regError = document.getElementById('regError');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const logoutBtn = document.getElementById('logoutBtn');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const userAvatar = document.getElementById('userAvatar');

  // Main App DOM Elements
  const todoForm = document.getElementById('todoForm');
  const todoTitle = document.getElementById('todoTitle');
  const todoPriority = document.getElementById('todoPriority');
  const todoCategory = document.getElementById('todoCategory');
  const todoList = document.getElementById('todoList');
  const filterPills = document.getElementById('filterPills');
  const totalTasksCount = document.getElementById('totalTasksCount');
  const completedTasksCount = document.getElementById('completedTasksCount');
  const honeycombPill = document.getElementById('honeycombPill');
  const newrelicPill = document.getElementById('newrelicPill');

  let allTodos = [];
  let currentFilter = 'all';
  let currentUser = null;

  // Global Auth Tab Switcher
  window.switchAuthTab = (tab) => {
    if (tab === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    }
  };

  // Helper fetch with Bearer token
  async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = options.headers || {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(url, { ...options, headers });
  }

  // Check auth session
  async function checkAuthSession() {
    const token = localStorage.getItem('token');
    if (!token) {
      showAuthOverlay();
      return;
    }

    try {
      const res = await fetchWithAuth('/api/auth/me');
      const data = await res.json();
      if (data.success && data.user) {
        currentUser = data.user;
        showAppContainer(currentUser);
      } else {
        localStorage.removeItem('token');
        showAuthOverlay();
      }
    } catch (err) {
      console.error('Session check failed:', err);
      showAuthOverlay();
    }
  }

  function showAuthOverlay() {
    authOverlay.classList.remove('hidden');
    appContainer.classList.add('hidden');
  }

  function showAppContainer(user) {
    authOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');

    userName.textContent = user.name || 'User';
    userEmail.textContent = user.email || '';
    userAvatar.textContent = (user.name || user.email || 'U').charAt(0).toUpperCase();

    fetchTelemetryStatus();
    fetchTodos();
  }

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        showAppContainer(currentUser);
      } else {
        loginError.textContent = data.error || 'Login failed.';
        loginError.style.display = 'block';
      }
    } catch (err) {
      loginError.textContent = 'Server connection error.';
      loginError.style.display = 'block';
    }
  });

  // Register handler
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regError.style.display = 'none';

    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        showAppContainer(currentUser);
      } else {
        regError.textContent = data.error || 'Registration failed.';
        regError.style.display = 'block';
      }
    } catch (err) {
      regError.textContent = 'Server connection error.';
      regError.style.display = 'block';
    }
  });

  // Logout handler
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    currentUser = null;
    allTodos = [];
    showAuthOverlay();
  });

  // Fetch telemetry configuration status
  async function fetchTelemetryStatus() {
    try {
      const res = await fetch('/api/telemetry-status');
      const data = await res.json();
      if (data.destinations) {
        if (data.destinations.honeycomb.startsWith('Configured')) {
          honeycombPill.title = 'Honeycomb API Key set in env';
          honeycombPill.style.opacity = '1';
        } else {
          honeycombPill.title = 'Set HONEYCOMB_API_KEY in .env for cloud export';
          honeycombPill.style.opacity = '0.5';
        }

        if (data.destinations.newrelic.startsWith('Configured')) {
          newrelicPill.title = 'New Relic License Key set in env';
          newrelicPill.style.opacity = '1';
        } else {
          newrelicPill.title = 'Set NEW_RELIC_LICENSE_KEY in .env for cloud export';
          newrelicPill.style.opacity = '0.5';
        }
      }
    } catch (e) {
      console.warn('Telemetry status fetch error:', e);
    }
  }

  // Fetch user's isolated todos
  async function fetchTodos() {
    try {
      const res = await fetchWithAuth('/api/todos');
      const data = await res.json();
      if (data.success) {
        allTodos = data.data;
        renderTodos();
      } else if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        showAuthOverlay();
      }
    } catch (err) {
      console.error('Failed to fetch todos:', err);
      todoList.innerHTML = `<div class="empty-state">Error connecting to Todo service.</div>`;
    }
  }

  // Render todos based on filter
  function renderTodos() {
    let filtered = allTodos;
    if (currentFilter === 'active') {
      filtered = allTodos.filter(t => !t.completed);
    } else if (currentFilter === 'completed') {
      filtered = allTodos.filter(t => t.completed);
    }

    const doneCount = allTodos.filter(t => t.completed).length;
    totalTasksCount.textContent = `${allTodos.length} Tasks`;
    completedTasksCount.textContent = `${doneCount} Done`;

    if (filtered.length === 0) {
      todoList.innerHTML = `<div class="empty-state">No tasks found. Add your first task on the left!</div>`;
      return;
    }

    todoList.innerHTML = filtered.map(todo => `
      <div class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
        <div class="todo-left">
          <div class="checkbox-custom" onclick="toggleTodo('${todo.id}', ${!todo.completed})">
            ${todo.completed ? '✓' : ''}
          </div>
          <div class="todo-info">
            <div class="todo-title">${escapeHtml(todo.title)}</div>
            <div class="todo-meta">
              <span class="meta-badge priority-${todo.priority}">${todo.priority}</span>
              <span class="meta-badge category">${escapeHtml(todo.category)}</span>
            </div>
          </div>
        </div>
        <button class="btn-delete" onclick="deleteTodo('${todo.id}')" title="Delete Task">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `).join('');
  }

  // Add todo form handler
  todoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = todoTitle.value.trim();
    if (!title) return;

    try {
      const res = await fetchWithAuth('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          priority: todoPriority.value,
          category: todoCategory.value
        })
      });
      const data = await res.json();
      if (data.success) {
        todoTitle.value = '';
        allTodos.unshift(data.data);
        renderTodos();
      }
    } catch (err) {
      console.error('Error adding todo:', err);
    }
  });

  // Global functions for inline onclick handlers
  window.toggleTodo = async (id, completed) => {
    try {
      const res = await fetchWithAuth(`/api/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed })
      });
      const data = await res.json();
      if (data.success) {
        const item = allTodos.find(t => t.id === id);
        if (item) item.completed = completed;
        renderTodos();
      }
    } catch (err) {
      console.error('Error updating todo:', err);
    }
  };

  window.deleteTodo = async (id) => {
    try {
      const res = await fetchWithAuth(`/api/todos/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        allTodos = allTodos.filter(t => t.id !== id);
        renderTodos();
      }
    } catch (err) {
      console.error('Error deleting todo:', err);
    }
  };

  // Filter pills handler
  filterPills.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderTodos();
    }
  });

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  // Initial session check
  checkAuthSession();
});
