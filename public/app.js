const state = { token: null, products: [], categories: {}, control: null };
const $ = (selector) => document.querySelector(selector);

const uiHeaders = () => ({ 'content-type': 'application/json' });
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...uiHeaders(), ...(options.headers || {}) } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { errorDescription: text }; }
  if (!response.ok) throw new Error(body.errorDescription || body.error || `HTTP ${response.status}`);
  return body;
}
async function getToken() {
  if (state.token) return state.token;
  const body = await json('/api/v2/access_token', { method: 'POST', body: JSON.stringify({ apiKey: 'vpzh-test-api-key', appId: '00000000-0000-4000-8000-000000000001', clientSecret: 'vpzh-test-client-secret' }) });
  state.token = body.token;
  return state.token;
}
async function iiko(path, body, retried = false) {
  const token = await getToken();
  try { return await json(path, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); }
  catch (error) { if (!retried && String(error.message).toLowerCase().includes('token')) { state.token = null; return iiko(path, body, true); } throw error; }
}
async function control(path, body, method = 'POST') { return json(`/__simulator/control/${path}`, { method, body: method === 'POST' ? JSON.stringify(body || {}) : undefined }); }
function showError(error) { const alert = $('#alert'); $('#alertText').textContent = error.message || String(error); alert.classList.remove('hidden'); }
function toast(message) { const node = document.createElement('div'); node.className = 'toast'; node.textContent = message; document.body.appendChild(node); setTimeout(() => node.remove(), 2200); }
function money(value) { return `${Number(value || 0).toLocaleString('ru-RU')} ₽`; }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', "'": '&#39;', '"': '&#34;' }[char])); }

async function load() {
  try {
    const [runtime, menu] = await Promise.all([control('status', undefined, 'GET'), iiko('/api/1/nomenclature', { organizationId: '3e41b6b4-9f43-4f65-8e5d-0c1c4c2f9a10', startRevision: 0 })]);
    state.control = runtime;
    state.products = menu.products || [];
    state.categories = Object.fromEntries((menu.productCategories || []).map((category) => [category.id, category.name]));
    render(runtime);
  } catch (error) { showError(error); }
}
function render(runtime) {
  const stopped = new Set((runtime.stoppedProducts || []).filter((item) => item.balance <= 0).map((item) => item.productId));
  const terminalAlive = runtime.terminalAlive;
  $('#terminalValue').textContent = terminalAlive ? 'Online' : 'Offline';
  $('#terminalValue').style.color = terminalAlive ? 'var(--green)' : 'var(--red)';
  $('#terminalFoot').textContent = terminalAlive ? 'Готов к операциям' : 'Операции заблокированы';
  $('#menuValue').textContent = `${Math.max(0, state.products.filter((product) => !product.isDeleted && !product.isHidden && !stopped.has(product.id)).length)} / ${state.products.filter((product) => !product.isDeleted && !product.isHidden).length}`;
  $('#menuFoot').textContent = `${stopped.size} product(s) в stop-list`; $('#ordersValue').textContent = runtime.orders?.length || 0; $('#faultsValue').textContent = runtime.faults?.length || 0; $('#scenarioFoot').textContent = `Сценарий: ${runtime.scenario}`;
  $('#scenarioCode').textContent = runtime.scenario; $('#scenarioSelect').value = runtime.scenario; $('#scenarioDescription').textContent = descriptionFor(runtime.scenario); $('#terminalBadge').textContent = terminalAlive ? 'ONLINE' : 'OFFLINE'; $('#terminalBadge').className = `badge ${terminalAlive ? 'success' : 'stopped'}`; $('#terminalName').textContent = 'VPZH demo kitchen terminal'; $('#terminalAddress').textContent = 'Краснодар, ул. Бабушкина, 181'; $('#terminalNote').textContent = terminalAlive ? 'Терминал готов принимать операции.' : 'Terminal offline: kitchen operations недоступны.';
  renderProducts(stopped); renderOrders(runtime.orders || []); renderFaults(runtime.faults || []); updateTrack(runtime.orders || []);
}
function descriptionFor(name) { const descriptions = { happy: 'Normal pickup flow', 'empty-stop-list': 'No stopped items', 'one-product-stop-listed': 'One product is unavailable', 'all-products-stop-listed': 'All demo products are unavailable', 'terminal-offline': 'Terminal group is unavailable', 'command-pending': 'Order creation is accepted asynchronously', 'command-success': 'Command status returns success', 'command-failed': 'Command status returns error', 'invalid-token': 'Protected endpoints reject issued tokens', 'expired-token': 'Protected endpoints treat issued tokens as expired' }; return descriptions[name] || 'Configured simulator runtime'; }
function renderProducts(stopped) { const query = ($('#productSearch').value || '').toLowerCase(); const rows = state.products.filter((product) => `${product.name} ${state.categories[product.productCategoryId] || ''}`.toLowerCase().includes(query)).map((product) => { const isStopped = stopped.has(product.id); const isHidden = product.isHidden || product.isDeleted; return `<tr><td><div class="product-name"><span class="product-avatar">${esc(product.name.slice(0, 1))}</span><div>${esc(product.name)}<div class="muted-text">${esc(product.id.slice(0, 8))} · simulation fixture</div></div></div></td><td>${esc(state.categories[product.productCategoryId] || 'Demo category')}</td><td class="price">${money(product.sizePrices?.[0]?.price?.currentPrice)}</td><td><span class="pill ${isHidden ? 'hidden-state' : 'available'}">${isHidden ? 'HIDDEN' : 'VISIBLE'}</span></td><td><span class="pill ${isStopped ? 'stopped' : 'available'}"><span>●</span>${isStopped ? 'STOP-LISTED' : 'AVAILABLE'}</span></td><td><button class="row-action" data-stop="${esc(product.id)}" data-stopped="${isStopped}">${isStopped ? 'Снять стоп' : 'Поставить стоп'}</button></td></tr>`; }).join(''); $('#productRows').innerHTML = rows || '<tr><td colspan="6" class="empty-state">Ничего не найдено</td></tr>'; document.querySelectorAll('[data-stop]').forEach((button) => button.addEventListener('click', async () => { try { const productId = button.dataset.stop; if (button.dataset.stopped === 'true') await control('unstop-list', { productId }); else await control('stop-list', { productId, balance: 0 }); toast('Stop-list обновлён'); await load(); } catch (error) { showError(error); } })); }
function orderClass(status) { if (status === 'Closed') return 'closed'; if (status === 'Cancelled') return 'cancelled'; if (status === 'CookingStarted' || status === 'CookingCompleted') return 'cooking'; return ''; }
function renderOrders(orders) { const rows = orders.map((order) => { const status = order.status || 'Unconfirmed'; const steps = ['Unconfirmed', 'WaitCooking', 'CookingStarted', 'CookingCompleted', 'Closed']; const current = steps.indexOf(status); const timeline = steps.map((_, index) => `<span class="${index < current ? 'done' : index === current ? 'current' : ''}"></span>`).join(''); return `<tr><td class="order-id">${esc(order.id)}</td><td><span class="status-chip">${esc(order.creationStatus || 'Success')}</span></td><td><span class="status-chip ${orderClass(status)}">${esc(status)}</span></td><td><div class="timeline">${timeline}</div></td><td><select class="order-control" data-order="${esc(order.id)}"><option value="">Изменить...</option><option value="accepted">Accepted</option><option value="cooking">Cooking</option><option value="ready">Ready</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></td></tr>`; }).join(''); $('#orderRows').innerHTML = rows || '<tr><td colspan="5" class="empty-state">Заказов пока нет. Создайте заказ через API.</td></tr>'; document.querySelectorAll('.order-control').forEach((select) => select.addEventListener('change', async () => { if (!select.value) return; try { await control('order-status', { orderId: select.dataset.order, status: select.value }); toast('Статус заказа обновлён'); await load(); } catch (error) { showError(error); } })); }
function renderFaults(faults) { $('#faultList').innerHTML = faults.length ? faults.map((fault) => `<div class="fault-item"><div><strong>${esc(fault.mode)}</strong><span>${esc(fault.endpoint)} · ${fault.delayMs || 0}ms · ${fault.remaining === null ? 'persistent' : `next ${fault.remaining}`}</span></div><b>!</b></div>`).join('') : '<div class="empty-state">Нет активных faults</div>'; }
function updateTrack(orders) { const active = orders.some((order) => order.status !== 'Closed' && order.status !== 'Cancelled'); $('#scenarioOrderStep').classList.toggle('active', active); }

$('#applyScenario').addEventListener('click', async () => { try { await control('scenario', { name: $('#scenarioSelect').value }); toast('Сценарий применён'); await load(); } catch (error) { showError(error); } });
$('#resetButton').addEventListener('click', async () => { try { await control('reset'); state.token = null; toast('Состояние сброшено'); await load(); } catch (error) { showError(error); } });
$('#refreshButton').addEventListener('click', load); $('#refreshScenario').addEventListener('click', load); $('#closeAlert').addEventListener('click', () => $('#alert').classList.add('hidden')); $('#productSearch').addEventListener('input', () => { const stopped = new Set((state.control?.stoppedProducts || []).filter((item) => item.balance <= 0).map((item) => item.productId)); renderProducts(stopped); });
$('#unstopAll').addEventListener('click', async () => { try { for (const item of state.control?.stoppedProducts || []) await control('unstop-list', { productId: item.productId }); toast('Все стопы сняты'); await load(); } catch (error) { showError(error); } });
$('#clearFaults').addEventListener('click', async () => { try { await control('clear-faults'); toast('Faults очищены'); await load(); } catch (error) { showError(error); } });
$('#applyFault').addEventListener('click', async () => { try { await control('fault', { endpoint: $('#faultEndpoint').value, mode: $('#faultMode').value, status: Number($('#faultStatus').value), delayMs: Number($('#faultDelay').value), remaining: 1 }); toast('Fault добавлен'); await load(); } catch (error) { showError(error); } });
$('#faultMode').addEventListener('change', () => { $('#faultStatusField').style.opacity = $('#faultMode').value === 'status' ? '1' : '.45'; });
document.querySelectorAll('.nav-item[href^="#"]').forEach((item) => item.addEventListener('click', () => { document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('active')); item.classList.add('active'); }));
load(); setInterval(load, 5000);
