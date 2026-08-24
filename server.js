require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { trace, metrics, SpanStatusCode } = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'otel-secret-key-super-secure';

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// OpenTelemetry Instrumentation Handles
const tracer = trace.getTracer('todo-crud-tracer', '1.0.0');
const meter = metrics.getMeter('todo-metrics-meter', '1.0.0');
const logger = logs.getLogger('todo-logger', '1.0.0');

// Metrics Instruments
const todoCreatedCounter = meter.createCounter('todo.created.count', {
  description: 'Total number of todos created',
});
const todoDeletedCounter = meter.createCounter('todo.deleted.count', {
  description: 'Total number of todos deleted',
});
const userRegisteredCounter = meter.createCounter('user.registered.count', {
  description: 'Total number of registered users',
});

// Helper for structured OTel Logging
function emitOtelLog(severityText, severityNumber, message, attributes = {}) {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan ? activeSpan.spanContext() : null;

  logger.emit({
    severityText,
    severityNumber,
    body: message,
    attributes: {
      ...attributes,
      ...(spanContext ? { trace_id: spanContext.traceId, span_id: spanContext.spanId } : {})
    }
  });
}

// In-memory Database of Users & Todos
const users = [];
let todos = [];

// Pre-seed a demo user for quick testing
(async () => {
  const hashedPassword = await bcrypt.hash('password123', 10);
  const demoUser = {
    id: 'user-demo-1',
    name: 'Demo User',
    email: 'demo@example.com',
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };
  users.push(demoUser);

  todos.push(
    { id: '1', userId: 'user-demo-1', title: 'Setup OpenTelemetry Collector', completed: true, priority: 'high', category: 'DevOps' },
    { id: '2', userId: 'user-demo-1', title: 'Export Traces, Metrics & Logs to Honeycomb & New Relic', completed: false, priority: 'high', category: 'Observability' },
    { id: '3', userId: 'user-demo-1', title: 'Verify User Context in Observability Platform', completed: false, priority: 'medium', category: 'Backend' }
  );
})();

// Helper delay simulation
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Middleware: Authentication & OpenTelemetry User Enrichment
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    emitOtelLog('WARN', SeverityNumber.WARN, 'Unauthorized request missing Bearer token', { http_target: req.originalUrl });
    return res.status(401).json({ success: false, error: 'Access token required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      emitOtelLog('WARN', SeverityNumber.WARN, 'Invalid or expired session token', { http_target: req.originalUrl });
      return res.status(403).json({ success: false, error: 'Invalid or expired session token.' });
    }

    req.user = user;

    // Attach user identity to active trace span
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttribute('user.id', user.id);
      activeSpan.setAttribute('user.email', user.email);
      activeSpan.setAttribute('auth.status', 'authenticated');
    }

    next();
  });
}

// =========================================================
// AUTH ENDPOINTS
// =========================================================

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  const span = tracer.startSpan('auth.register');

  try {
    if (!name || !email || !password) {
      emitOtelLog('WARN', SeverityNumber.WARN, 'Registration failed: missing required fields');
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing required fields' });
      span.end();
      return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }

    const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      emitOtelLog('WARN', SeverityNumber.WARN, 'Registration failed: email already registered', { user_email: email });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Email already registered' });
      span.end();
      return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    userRegisteredCounter.add(1, { environment: process.env.NODE_ENV || 'development' });

    span.setAttribute('user.id', newUser.id);
    span.setAttribute('user.email', newUser.email);

    emitOtelLog('INFO', SeverityNumber.INFO, `New user registered: ${newUser.email}`, { user_id: newUser.id, user_email: newUser.email });

    const token = jwt.sign(
      { id: newUser.id, name: newUser.name, email: newUser.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      user: { id: newUser.id, name: newUser.name, email: newUser.email }
    });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    emitOtelLog('ERROR', SeverityNumber.ERROR, `Registration error: ${err.message}`);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    res.status(500).json({ success: false, error: err.message });
  } finally {
    span.end();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const span = tracer.startSpan('auth.login');

  try {
    if (!email || !password) {
      emitOtelLog('WARN', SeverityNumber.WARN, 'Login failed: missing credentials');
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Missing credentials' });
      span.end();
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      emitOtelLog('WARN', SeverityNumber.WARN, 'Login failed: user not found', { user_email: email });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'User not found' });
      span.end();
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      emitOtelLog('WARN', SeverityNumber.WARN, 'Login failed: invalid password', { user_email: email });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Invalid password' });
      span.end();
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    span.setAttribute('user.id', user.id);
    span.setAttribute('user.email', user.email);

    emitOtelLog('INFO', SeverityNumber.INFO, `User logged in successfully: ${user.email}`, { user_id: user.id, user_email: user.email });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    emitOtelLog('ERROR', SeverityNumber.ERROR, `Login error: ${err.message}`);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    res.status(500).json({ success: false, error: err.message });
  } finally {
    span.end();
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// =========================================================
// TODO CRUD ENDPOINTS (With Metrics & Correlated OTel Logs)
// =========================================================

app.get('/api/todos', authenticateToken, async (req, res) => {
  const span = tracer.startSpan('db.fetch_user_todos');
  try {
    const userTodos = todos.filter(t => t.userId === req.user.id);
    span.setAttribute('todo.count', userTodos.length);

    emitOtelLog('INFO', SeverityNumber.INFO, `Fetched ${userTodos.length} todos for user ${req.user.email}`, { user_id: req.user.id, todo_count: userTodos.length });

    await delay(25);
    res.json({ success: true, count: userTodos.length, data: userTodos });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    emitOtelLog('ERROR', SeverityNumber.ERROR, `Fetch todos error: ${err.message}`);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    res.status(500).json({ success: false, error: err.message });
  } finally {
    span.end();
  }
});

app.post('/api/todos', authenticateToken, async (req, res) => {
  const { title, priority = 'medium', category = 'General' } = req.body;
  const span = tracer.startSpan('db.create_user_todo');

  if (!title || title.trim() === '') {
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'Title is required' });
    span.end();
    return res.status(400).json({ success: false, error: 'Title is required' });
  }

  try {
    const newTodo = {
      id: Date.now().toString(),
      userId: req.user.id,
      title: title.trim(),
      completed: false,
      priority,
      category,
      createdAt: new Date().toISOString()
    };

    span.setAttribute('todo.id', newTodo.id);
    span.setAttribute('todo.title', newTodo.title);
    span.setAttribute('todo.priority', newTodo.priority);
    span.setAttribute('todo.category', newTodo.category);

    todos.unshift(newTodo);

    // Record Custom OTel Metric
    todoCreatedCounter.add(1, {
      priority: newTodo.priority,
      category: newTodo.category
    });

    // Emit Correlated OTel Log
    emitOtelLog('INFO', SeverityNumber.INFO, `Todo created: "${newTodo.title}"`, {
      todo_id: newTodo.id,
      todo_priority: newTodo.priority,
      todo_category: newTodo.category,
      user_id: req.user.id,
      user_email: req.user.email
    });

    await delay(35);
    res.status(201).json({ success: true, data: newTodo });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    emitOtelLog('ERROR', SeverityNumber.ERROR, `Create todo error: ${err.message}`);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    res.status(500).json({ success: false, error: err.message });
  } finally {
    span.end();
  }
});

app.put('/api/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, completed, priority, category } = req.body;
  const span = tracer.startSpan('db.update_user_todo');
  span.setAttribute('todo.id', id);

  try {
    const todo = todos.find(t => t.id === id && t.userId === req.user.id);
    if (!todo) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Todo not found or unauthorized' });
      span.end();
      return res.status(404).json({ success: false, error: 'Todo not found.' });
    }

    if (title !== undefined) todo.title = title;
    if (completed !== undefined) todo.completed = Boolean(completed);
    if (priority !== undefined) todo.priority = priority;
    if (category !== undefined) todo.category = category;

    span.setAttribute('todo.completed', todo.completed);

    emitOtelLog('INFO', SeverityNumber.INFO, `Todo updated: ID ${id} (completed: ${todo.completed})`, {
      todo_id: id,
      completed: todo.completed,
      user_id: req.user.id
    });

    await delay(25);
    res.json({ success: true, data: todo });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    emitOtelLog('ERROR', SeverityNumber.ERROR, `Update todo error: ${err.message}`);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    res.status(500).json({ success: false, error: err.message });
  } finally {
    span.end();
  }
});

app.delete('/api/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const span = tracer.startSpan('db.delete_user_todo');
  span.setAttribute('todo.id', id);

  try {
    const index = todos.findIndex(t => t.id === id && t.userId === req.user.id);
    if (index === -1) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Todo not found or unauthorized' });
      span.end();
      return res.status(404).json({ success: false, error: 'Todo not found.' });
    }

    const deletedItem = todos.splice(index, 1)[0];
    span.setAttribute('todo.deleted_title', deletedItem.title);

    // Record Custom OTel Metric
    todoDeletedCounter.add(1, { category: deletedItem.category });

    // Emit Correlated OTel Log
    emitOtelLog('INFO', SeverityNumber.INFO, `Todo deleted: "${deletedItem.title}"`, {
      todo_id: id,
      user_id: req.user.id
    });

    await delay(25);
    res.json({ success: true, data: deletedItem });
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (err) {
    emitOtelLog('ERROR', SeverityNumber.ERROR, `Delete todo error: ${err.message}`);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    res.status(500).json({ success: false, error: err.message });
  } finally {
    span.end();
  }
});

app.get('/api/telemetry-status', (req, res) => {
  res.json({
    service: process.env.OTEL_SERVICE_NAME || 'todo-backend-service',
    collectorEndpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318/v1/traces',
    signals: ['Traces', 'Metrics', 'Logs'],
    destinations: {
      honeycomb: process.env.HONEYCOMB_API_KEY ? 'Configured' : 'Missing API Key (Check .env)',
      newrelic: process.env.NEW_RELIC_LICENSE_KEY ? 'Configured' : 'Missing License Key (Check .env)',
      localDebugLogger: 'Active (Logs/Metrics/Traces via Collector)'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Todo Service with OTel Traces, Metrics & Logs listening on port ${PORT}`);
  console.log(`🔑 Demo User Credentials: demo@example.com / password123`);
});
