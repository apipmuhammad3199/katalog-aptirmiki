const TOKEN_KEY = "aptirmiki_admin_token";
let TOKEN = sessionStorage.getItem(TOKEN_KEY) || null;
let STATUS_FLOW = [];
let ALL_ORDERS = [];
let ALL_PRODUCTS = [];
let currentTab = "all"; // 'all' | 'active' | 'completed' | 'products'

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
  loadAll();
}

function showLogin(message) {
  TOKEN = null;
  sessionStorage.removeItem(TOKEN_KEY);
  dashboardScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  const errEl = document.getElementById("login-error");
  if (message) {
    errEl.textContent = message;
    errEl.classList.remove("hidden");
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("login-password").value;
  const errEl = document.getElementById("login-error");
  errEl.classList.add("hidden");
  try {
    const { token } = await Api.post("/api/admin/login", { password });
    TOKEN = token;
    sessionStorage.setItem(TOKEN_KEY, token);
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await Api.post("/api/admin/logout", {}, { token: TOKEN });
  } catch (e) {}
  showLogin();
});

async function loadAll() {
  try {
    const [ordersData, summaryData, productsData] = await Promise.all([
      Api.get("/api/admin/orders", { token: TOKEN }),
      Api.get("/api/admin/summary", { token: TOKEN }),
      Api.get("/api/admin/products", { token: TOKEN }),
    ]);
    STATUS_FLOW = ordersData.statusFlow;
    ALL_ORDERS = ordersData.orders;
    ALL_PRODUCTS = productsData.products;

    populateStatusFilter();
    updateTabBadges();
    renderSummaryCards(summaryData, ALL_ORDERS);
    renderBankSummaryCards(summaryData.bankSummary || []);
    renderBrandSummary(summaryData.brandSummary || []);
    renderRestock(summaryData.summary);
    applyFilters();
    renderProductsTable();
  } catch (err) {
    if (err.status === 401) {
      showLogin("Sesi berakhir, silakan login kembali.");
    } else {
      alert("Gagal memuat data: " + err.message);
    }
  }
}

function populateStatusFilter() {
  const sel = document.getElementById("status-filter");
  if (sel.dataset.filled) return;
  sel.dataset.filled = "1";
  STATUS_FLOW.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = s.label;
    sel.appendChild(opt);
  });
}

function updateTabBadges() {
  const countAll = ALL_ORDERS.length;
  const countActive = ALL_ORDERS.filter((o) => o.status !== "selesai").length;
  const countCompleted = ALL_ORDERS.filter((o) => o.status === "selesai").length;
  const countProducts = ALL_PRODUCTS.length;

  document.getElementById("badge-count-all").textContent = countAll;
  document.getElementById("badge-count-active").textContent = countActive;
  document.getElementById("badge-count-completed").textContent = countCompleted;
  document.getElementById("badge-count-products").textContent = countProducts;
}

function renderSummaryCards(summaryData, orders) {
  const cards = [
    {
      label: "Total Pesanan",
      value: summaryData.totalOrders,
      color: "text-gray-900",
      bg: "bg-blue-50 text-[--color-primary]",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>`
    },
    {
      label: "Omset Kotor",
      value: rupiah(summaryData.totalRevenue || 0),
      color: "text-[--color-primary]",
      bg: "bg-blue-50 text-[--color-primary]",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 12v-2m-9-1h18"/></svg>`
    },
    {
      label: "Modal Supplier",
      value: rupiah(summaryData.totalCost || 0),
      color: "text-amber-600",
      bg: "bg-amber-50 text-amber-600",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`
    },
    {
      label: "Keuntungan Panitia",
      value: rupiah(summaryData.totalProfit || 0),
      color: "text-emerald-600",
      bg: "bg-emerald-50 text-emerald-600",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>`
    },
    {
      label: "Margin Laba",
      value: `${summaryData.profitMarginPercent || 0}%`,
      color: "text-indigo-600",
      bg: "bg-indigo-50 text-indigo-600",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>`
    },
  ];

  document.getElementById("summary-cards").innerHTML = cards
    .map(
      (c) => `<div class="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm flex items-center justify-between">
        <div>
          <p class="text-xs text-gray-400 font-medium mb-0.5">${c.label}</p>
          <p class="font-extrabold text-base sm:text-lg ${c.color}">${c.value}</p>
        </div>
        <div class="p-2 rounded-xl ${c.bg}">${c.icon}</div>
      </div>`
    )
    .join("");
}

function renderBankSummaryCards(bankSummary) {
  const container = document.getElementById("bank-summary-cards");
  if (!container) return;

  const colorMap = {
    BCA: { bg: "bg-blue-50/70 border-blue-200", badge: "bg-blue-600 text-white", text: "text-blue-900" },
    BSI: { bg: "bg-emerald-50/70 border-emerald-200", badge: "bg-emerald-600 text-white", text: "text-emerald-900" },
    Mandiri: { bg: "bg-amber-50/70 border-amber-200", badge: "bg-amber-600 text-white", text: "text-amber-900" },
    Lainnya: { bg: "bg-gray-50 border-gray-200", badge: "bg-gray-600 text-white", text: "text-gray-900" },
  };

  container.innerHTML = bankSummary
    .map((b) => {
      const theme = colorMap[b.bank] || colorMap.Lainnya;
      return `
      <div class="bg-white rounded-xl border ${theme.bg} p-3.5 shadow-sm flex items-center justify-between">
        <div>
          <div class="flex items-center gap-1.5 mb-1">
            <span class="text-xs font-bold px-2 py-0.5 rounded-full ${theme.badge}">${escapeHtml(b.bank)}</span>
            <span class="text-xs text-gray-500 font-medium">(${b.count} Transaksi)</span>
          </div>
          <p class="font-black text-lg ${theme.text}">${rupiah(b.totalRevenue)}</p>
        </div>
        <div class="p-2 bg-white rounded-lg border border-gray-100 shadow-xs text-xs font-mono font-bold text-gray-500">
          Transfer
        </div>
      </div>`;
    })
    .join("");
}

function renderBrandSummary(brandSummary) {
  const container = document.getElementById("brand-summary");
  if (!container) return;

  if (!brandSummary || brandSummary.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-400">Belum ada data transaksi brand.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="overflow-x-auto">
      <table class="w-full text-xs min-w-[450px]">
        <thead>
          <tr class="border-b border-gray-100 text-gray-400 text-left">
            <th class="pb-2 font-semibold">Brand / Supplier</th>
            <th class="pb-2 font-semibold text-right">Terjual</th>
            <th class="pb-2 font-semibold text-right">Omset</th>
            <th class="pb-2 font-semibold text-right">Modal</th>
            <th class="pb-2 font-semibold text-right text-emerald-700">Laba Net</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          ${brandSummary
            .map(
              (bs) => `
            <tr>
              <td class="py-2 font-bold text-gray-800 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-[--color-primary]"></span>
                <span>${escapeHtml(bs.brand)}</span>
              </td>
              <td class="py-2 text-right font-semibold text-gray-700">${bs.totalQty} pcs</td>
              <td class="py-2 text-right text-gray-900 font-medium">${rupiah(bs.totalRevenue)}</td>
              <td class="py-2 text-right text-amber-700 font-medium">${rupiah(bs.totalCost)}</td>
              <td class="py-2 text-right text-emerald-700 font-extrabold">${rupiah(bs.totalProfit)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderRestock(summary) {
  const sorted = summary.filter((s) => s.totalQty > 0).sort((a, b) => b.totalQty - a.totalQty);
  if (sorted.length === 0) {
    document.getElementById("restock-summary").innerHTML = `<p class="text-xs text-gray-400">Belum ada data pesanan.</p>`;
    return;
  }
  const max = Math.max(...sorted.map((s) => s.totalQty));
  document.getElementById("restock-summary").innerHTML = sorted
    .map(
      (s) => `
    <div class="flex items-center gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
      <span class="w-44 truncate text-gray-800 font-semibold">${escapeHtml(s.name)}</span>
      <div class="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div class="bg-[--color-primary] h-full rounded-full transition-all" style="width:${(s.totalQty / max) * 100}%"></div>
      </div>
      <span class="w-20 text-right font-bold text-gray-900">${s.totalQty} ${escapeHtml(s.unit)}</span>
      <span class="w-28 text-right text-gray-500 font-medium">Modal: ${rupiah(s.totalCost || 0)}</span>
      <span class="w-28 text-right text-emerald-600 font-bold">Laba: ${rupiah(s.totalProfit || 0)}</span>
    </div>`
    )
    .join("");
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("text-[--color-primary]", isActive);
    btn.classList.toggle("border-[--color-primary]", isActive);
    btn.classList.toggle("font-semibold", isActive);
    btn.classList.toggle("text-gray-500", !isActive);
    btn.classList.toggle("border-transparent", !isActive);
    btn.classList.toggle("font-medium", !isActive);
  });

  const ordersTableWrap = document.getElementById("orders-table-wrap");
  const productsTableWrap = document.getElementById("products-table-wrap");
  const ordersControls = document.getElementById("orders-controls");

  if (tab === "products") {
    ordersTableWrap.classList.add("hidden");
    productsTableWrap.classList.remove("hidden");
    renderProductsTable();
  } else {
    productsTableWrap.classList.add("hidden");
    ordersTableWrap.classList.remove("hidden");
    applyFilters();
  }
}

function applyFilters() {
  if (currentTab === "products") return;
  const q = document.getElementById("admin-search").value.trim().toLowerCase();
  const statusFilter = document.getElementById("status-filter").value;
  const bankFilter = document.getElementById("bank-filter") ? document.getElementById("bank-filter").value : "";

  const filtered = ALL_ORDERS.filter((o) => {
    if (currentTab === "active" && o.status === "selesai") return false;
    if (currentTab === "completed" && o.status !== "selesai") return false;

    const matchStatus = !statusFilter || o.status === statusFilter;
    const matchBank = !bankFilter || (o.customer && o.customer.targetBank === bankFilter);

    const itemsText = o.items.map((i) => `${i.name} ${i.brand || ""}`).join(" ");
    const haystack = `${o.id} ${o.customer.name} ${o.customer.wa} ${o.customer.instansi} ${o.customer.targetBank || ""} ${o.customer.method} ${o.customer.detail || ""} ${itemsText}`.toLowerCase();
    const matchQuery = !q || haystack.includes(q);

    return matchStatus && matchBank && matchQuery;
  });

  renderTable(filtered);
}

function statusBadgeClass(key) {
  const map = {
    menunggu_pembayaran: "bg-amber-50 text-amber-600 border border-amber-200",
    pembayaran_terverifikasi: "bg-blue-50 text-blue-600 border border-blue-200",
    diproses: "bg-purple-50 text-purple-600 border border-purple-200",
    selesai: "bg-emerald-50 text-emerald-600 border border-emerald-200",
  };
  return map[key] || "bg-gray-50 text-gray-600";
}

function miniTrackingProgressBar(orderStatus) {
  const currentIdx = STATUS_FLOW.findIndex((s) => s.key === orderStatus);
  const steps = STATUS_FLOW.map((s, idx) => {
    const done = idx <= currentIdx;
    return `
      <div class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-full ${done ? "bg-[--color-primary]" : "bg-gray-200"}"></span>
        <span class="text-[10px] ${done ? "font-semibold text-gray-800" : "text-gray-400"}">${escapeHtml(s.label.split(" ")[0])}</span>
      </div>`;
  }).join('<span class="text-gray-300 text-[10px]">→</span>');

  return `<div class="flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-lg border border-gray-100">${steps}</div>`;
}

function renderTable(orders) {
  const tbody = document.getElementById("orders-tbody");
  const emptyEl = document.getElementById("orders-empty");
  if (orders.length === 0) {
    tbody.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  tbody.innerHTML = orders
    .map((o) => {
      const itemsText = o.items.map((i) => `${i.name} x${i.qty}`).join(", ");
      const statusOptions = STATUS_FLOW.map(
        (s) => `<option value="${s.key}" ${s.key === o.status ? "selected" : ""}>${escapeHtml(s.label)}</option>`
      ).join("");
function getProofSrc(proof) {
  if (!proof) return "";
  if (proof.dataUrl) return proof.dataUrl;
  if (proof.filename) return `/uploads/${encodeURIComponent(proof.filename)}`;
  return "";
}

      const proofCell = o.proof
        ? `<img data-src="${getProofSrc(o.proof)}" class="proof-thumb w-10 h-10 object-cover rounded cursor-pointer border border-gray-200 shadow-sm hover:scale-105 transition" src="${getProofSrc(o.proof)}" title="Klik untuk memperbesar" />`
        : `<span class="text-xs text-gray-300">—</span>`;

      return `
      <tr class="border-t border-gray-100 align-top hover:bg-gray-50/60 transition">
        <td class="px-3 py-3 font-mono font-bold text-[--color-primary] whitespace-nowrap">#${escapeHtml(o.id)}</td>
        <td class="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">${new Date(o.createdAt).toLocaleString("id-ID")}</td>
        <td class="px-3 py-3">
          <div class="flex items-center gap-2 mb-0.5">
            <p class="font-semibold text-gray-900">${escapeHtml(o.customer.name)}</p>
            <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono font-bold text-[11px] border border-indigo-100">${escapeHtml(o.customer.targetBank || "BCA")}</span>
          </div>
          <a href="https://wa.me/${escapeHtml(o.customer.wa.replace(/\D/g, ''))}" target="_blank" rel="noopener" class="text-xs text-emerald-600 font-medium hover:underline flex items-center gap-1">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-0.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            <span>${escapeHtml(o.customer.wa)}</span>
          </a>
          <p class="text-[11px] text-gray-400 font-medium">${escapeHtml(o.customer.method)}${o.customer.detail ? " — " + escapeHtml(o.customer.detail) : ""}</p>
        </td>
        <td class="px-3 py-3 text-xs text-gray-600 font-medium">${escapeHtml(o.customer.instansi)}</td>
        <td class="px-3 py-3 text-xs max-w-[200px] text-gray-700">${escapeHtml(itemsText)}</td>
        <td class="px-3 py-3 font-bold whitespace-nowrap text-gray-900">${rupiah(o.total)}</td>
        <td class="px-3 py-3">${proofCell}</td>
        <td class="px-3 py-3">${miniTrackingProgressBar(o.status)}</td>
        <td class="px-3 py-3">
          <select data-order-id="${o.id}" class="status-select text-xs rounded-lg px-2.5 py-1.5 font-semibold cursor-pointer focus:ring-2 focus:ring-blue-200 transition ${statusBadgeClass(o.status)}">
            ${statusOptions}
          </select>
        </td>
        <td class="px-3 py-3 text-right whitespace-nowrap space-x-1">
          <button data-track-id="${o.id}" class="track-detail-btn text-xs bg-blue-50 text-[--color-primary] hover:bg-blue-100 font-semibold px-2.5 py-1 rounded-lg border border-blue-200 transition">Tracking</button>
          <button data-delete-id="${o.id}" class="delete-btn text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition">Hapus</button>
        </td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const id = e.target.dataset.orderId;
      const newStatus = e.target.value;
      await updateOrderStatus(id, newStatus, e.target);
    });
  });

  tbody.querySelectorAll(".track-detail-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openTrackingModal(btn.dataset.trackId);
    });
  });

  tbody.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.deleteId;
      showConfirmModal({
        title: "Hapus Pesanan?",
        message: `Apakah Anda yakin ingin menghapus pesanan #${id}? Tindakan ini tidak dapat dibatalkan.`,
        confirmText: "Ya, Hapus Pesanan",
        onConfirm: async () => {
          btn.disabled = true;
          try {
            await Api.delete(`/api/admin/orders/${encodeURIComponent(id)}`, { token: TOKEN });
            ALL_ORDERS = ALL_ORDERS.filter((o) => o.id !== id);
            showSuccessModal({ title: "Pesanan Dihapus!", message: `Pesanan #${id} telah berhasil dihapus.` });
            loadAll();
          } catch (err) {
            alert("Gagal menghapus pesanan: " + err.message);
            btn.disabled = false;
          }
        },
      });
    });
  });

  tbody.querySelectorAll(".proof-thumb").forEach((img) => {
    img.addEventListener("click", () => {
      document.getElementById("lightbox-img").src = img.dataset.src;
      document.getElementById("lightbox").classList.remove("hidden");
    });
  });
}

function convertDriveUrl(url) {
  if (!url || typeof url !== "string") return url || "";
  const trimmed = url.trim();
  const fileIdMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
  }
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
  }
  return trimmed;
}

// ===== Products Table & Form Management =====
function renderProductsTable() {
  const tbody = document.getElementById("products-tbody");
  if (!tbody) return;

  tbody.innerHTML = ALL_PRODUCTS.map((p) => {
    const imgSrc = convertDriveUrl(p.image);
    const sellPrice = Number(p.price) || 0;
    const suppPrice = p.supplierPrice !== undefined ? Number(p.supplierPrice) : Math.round(sellPrice * 0.7);
    const profit = sellPrice - suppPrice;
    const margin = sellPrice > 0 ? ((profit / sellPrice) * 100).toFixed(0) : 0;

    return `
    <tr class="border-t border-gray-100 align-middle hover:bg-gray-50/60 transition">
      <td class="px-3 py-3">
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name)}" class="w-12 h-12 object-cover rounded-lg border border-gray-200 shadow-sm" onerror="this.src='https://via.placeholder.com/100?text=Foto+Produk'" />
      </td>
      <td class="px-3 py-3">
        <p class="font-semibold text-gray-900">${escapeHtml(p.name)}</p>
        <span class="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-bold border border-purple-100">${escapeHtml(p.brand || "Betawi Asli")}</span>
      </td>
      <td class="px-3 py-3 text-xs"><span class="bg-blue-50 text-[--color-primary] px-2 py-1 rounded-full font-semibold border border-blue-100">${escapeHtml(p.category)}</span></td>
      <td class="px-3 py-3 font-semibold text-amber-700 whitespace-nowrap">${rupiah(suppPrice)}</td>
      <td class="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">${rupiah(sellPrice)} <span class="text-xs font-normal text-gray-400">/${escapeHtml(p.unit)}</span></td>
      <td class="px-3 py-3 whitespace-nowrap">
        <span class="font-bold text-emerald-700">${rupiah(profit)}</span>
        <span class="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono font-semibold ml-1 border border-emerald-100">+${margin}%</span>
      </td>
      <td class="px-3 py-3 text-xs text-gray-600">
        <div>📍 ${escapeHtml(p.origin || "Betawi, Jakarta")}</div>
        <div class="text-amber-700 text-[11px]">⏳ ${escapeHtml(p.expiryDetail || "Tahan Lama")}</div>
      </td>
      <td class="px-3 py-3 text-right whitespace-nowrap space-x-1">
        <button data-edit-prod="${escapeHtml(p.id)}" class="edit-prod-btn text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold px-2.5 py-1 rounded-lg border border-indigo-200 transition">Edit</button>
        <button data-del-prod="${escapeHtml(p.id)}" class="del-prod-btn text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50 transition">Hapus</button>
      </td>
    </tr>
  `;
  }).join("");

  tbody.querySelectorAll(".edit-prod-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openProductModal(btn.dataset.editProd);
    });
  });

  tbody.querySelectorAll(".del-prod-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delProd;
      const prod = ALL_PRODUCTS.find((p) => p.id === id);
      showConfirmModal({
        title: "Hapus Produk?",
        message: `Apakah Anda yakin ingin menghapus produk "${prod?.name || id}"? Tindakan ini tidak dapat dibatalkan.`,
        confirmText: "Ya, Hapus Produk",
        onConfirm: async () => {
          btn.disabled = true;
          try {
            await Api.delete(`/api/admin/products/${encodeURIComponent(id)}`, { token: TOKEN });
            showSuccessModal({ title: "Produk Dihapus!", message: `Produk "${prod?.name || id}" telah berhasil dihapus.` });
            loadAll();
          } catch (err) {
            alert("Gagal menghapus produk: " + err.message);
            btn.disabled = false;
          }
        },
      });
    });
  });
}

function formatRupiahInput(value) {
  if (value === undefined || value === null || value === "") return "";
  const clean = String(value).replace(/\D/g, "");
  if (!clean) return "";
  return new Intl.NumberFormat("id-ID").format(Number(clean));
}

function parseRupiahInput(value) {
  if (!value) return 0;
  const clean = String(value).replace(/\D/g, "");
  return Number(clean) || 0;
}

function updateProfitPreview() {
  const supp = parseRupiahInput(document.getElementById("prod-supplier-price").value);
  const sell = parseRupiahInput(document.getElementById("prod-price").value);
  const profit = sell - supp;
  const margin = sell > 0 ? ((profit / sell) * 100).toFixed(1) : 0;

  const valEl = document.getElementById("profit-preview-val");
  if (valEl) {
    valEl.textContent = `${rupiah(profit)} (${margin}%)`;
    valEl.className = profit >= 0 ? "font-bold text-sm text-emerald-800" : "font-bold text-sm text-red-600";
  }
}

let successModalTimer = null;
function showSuccessModal({ title = "Berhasil!", message = "Data berhasil diperbarui.", duration = 2400 } = {}) {
  const modal = document.getElementById("success-modal");
  if (!modal) return;
  const titleEl = document.getElementById("success-modal-title");
  const msgEl = document.getElementById("success-modal-msg");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;

  // Re-trigger SVG Checkmark animation
  const iconContainer = modal.querySelector(".anim-checkmark-pop");
  if (iconContainer) {
    iconContainer.innerHTML = `
      <svg class="w-20 h-20" viewBox="0 0 52 52">
        <circle class="checkmark-circle" cx="26" cy="26" r="23" />
        <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
      </svg>
    `;
  }

  modal.classList.remove("hidden");

  if (successModalTimer) clearTimeout(successModalTimer);
  if (duration > 0) {
    successModalTimer = setTimeout(() => {
      modal.classList.add("hidden");
    }, duration);
  }
}

document.getElementById("success-modal-close")?.addEventListener("click", () => {
  if (successModalTimer) clearTimeout(successModalTimer);
  document.getElementById("success-modal")?.classList.add("hidden");
});

function showConfirmModal({ title = "Konfirmasi Hapus", message = "Apakah Anda yakin?", confirmText = "Ya, Hapus", onConfirm }) {
  const modal = document.getElementById("confirm-modal");
  if (!modal) {
    if (confirm(message)) onConfirm();
    return;
  }
  const titleEl = document.getElementById("confirm-modal-title");
  const msgEl = document.getElementById("confirm-modal-msg");
  const okBtn = document.getElementById("confirm-modal-ok");
  const cancelBtn = document.getElementById("confirm-modal-cancel");

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (okBtn) okBtn.textContent = confirmText;

  modal.classList.remove("hidden");

  const cleanup = () => {
    modal.classList.add("hidden");
    okBtn.onclick = null;
    cancelBtn.onclick = null;
  };

  cancelBtn.onclick = cleanup;
  okBtn.onclick = async () => {
    cleanup();
    if (onConfirm) await onConfirm();
  };
}

function openProductModal(productId = null) {
  const form = document.getElementById("product-form");
  const errEl = document.getElementById("product-form-error");
  errEl.classList.add("hidden");

  if (productId) {
    const p = ALL_PRODUCTS.find((item) => item.id === productId);
    if (!p) return;
    document.getElementById("product-modal-title").textContent = "Edit Produk";
    document.getElementById("prod-id").value = p.id;
    document.getElementById("prod-name").value = p.name;
    if (document.getElementById("prod-brand")) document.getElementById("prod-brand").value = p.brand || "Betawi Asli";
    document.getElementById("prod-category").value = p.category;
    document.getElementById("prod-price").value = p.price ? formatRupiahInput(p.price) : "";
    document.getElementById("prod-supplier-price").value = p.supplierPrice !== undefined ? formatRupiahInput(p.supplierPrice) : formatRupiahInput(Math.round(p.price * 0.7));
    document.getElementById("prod-unit").value = p.unit;
    document.getElementById("prod-origin").value = p.origin || "";
    document.getElementById("prod-expiry").value = p.expiryDetail || "";
    document.getElementById("prod-desc").value = p.description || "";
    document.getElementById("prod-image").value = p.image || "";
  } else {
    document.getElementById("product-modal-title").textContent = "Tambah Produk Baru";
    form.reset();
    document.getElementById("prod-id").value = "";
  }

  updateProfitPreview();
  document.getElementById("product-modal").classList.remove("hidden");
}

function setupCurrencyInput(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("input", (e) => {
    const num = parseRupiahInput(e.target.value);
    e.target.value = num > 0 ? formatRupiahInput(num) : "";
    updateProfitPreview();
  });
}

setupCurrencyInput(document.getElementById("prod-supplier-price"));
setupCurrencyInput(document.getElementById("prod-price"));

document.getElementById("add-product-btn").addEventListener("click", () => {
  openProductModal(null);
});

document.getElementById("close-product-modal").addEventListener("click", () => {
  document.getElementById("product-modal").classList.add("hidden");
});

document.getElementById("cancel-product-modal").addEventListener("click", () => {
  document.getElementById("product-modal").classList.add("hidden");
});

document.getElementById("product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("product-form-error");
  errEl.classList.add("hidden");

  const id = document.getElementById("prod-id").value;
  const payload = {
    name: document.getElementById("prod-name").value,
    brand: document.getElementById("prod-brand") ? document.getElementById("prod-brand").value : "Betawi Asli",
    category: document.getElementById("prod-category").value,
    price: parseRupiahInput(document.getElementById("prod-price").value),
    supplierPrice: parseRupiahInput(document.getElementById("prod-supplier-price").value),
    unit: document.getElementById("prod-unit").value,
    origin: document.getElementById("prod-origin").value,
    expiryDetail: document.getElementById("prod-expiry").value,
    description: document.getElementById("prod-desc").value,
    image: convertDriveUrl(document.getElementById("prod-image").value),
  };

  const btn = document.getElementById("save-product-btn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  try {
    if (id) {
      await Api.put(`/api/admin/products/${encodeURIComponent(id)}`, payload, { token: TOKEN });
      showSuccessModal({ title: "Produk Diperbarui!", message: `Data produk "${payload.name}" berhasil disimpan.` });
    } else {
      await Api.post("/api/admin/products", payload, { token: TOKEN });
      showSuccessModal({ title: "Produk Ditambahkan!", message: `Produk "${payload.name}" berhasil ditambahkan ke katalog.` });
    }
    document.getElementById("product-modal").classList.add("hidden");
    loadAll();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Simpan Produk";
  }
});

async function updateOrderStatus(orderId, newStatus, targetElement) {
  if (targetElement) targetElement.disabled = true;
  try {
    await Api.patch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, { status: newStatus }, { token: TOKEN });
    const order = ALL_ORDERS.find((o) => o.id === orderId);
    if (order) order.status = newStatus;
    updateTabBadges();
    renderSummaryCards({ totalOrders: ALL_ORDERS.length, totalRevenue: ALL_ORDERS.reduce((s, o) => s + o.total, 0) }, ALL_ORDERS);
    applyFilters();
    showSuccessModal({ title: "Status Diperbarui!", message: `Status pesanan #${orderId} telah diperbarui.` });
  } catch (err) {
    alert("Gagal update status: " + err.message);
  } finally {
    if (targetElement) targetElement.disabled = false;
  }
}

function openTrackingModal(orderId) {
  const order = ALL_ORDERS.find((o) => o.id === orderId);
  if (!order) return;

  const currentIdx = STATUS_FLOW.findIndex((s) => s.key === order.status);
  const steps = STATUS_FLOW.map((s, idx) => {
    const done = idx <= currentIdx;
    return `
      <div class="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
        <div class="w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center ${
          done ? "bg-[--color-primary] text-white shadow-sm" : "bg-gray-100 text-gray-400"
        }">${idx + 1}</div>
        <div class="flex-1">
          <p class="text-xs font-semibold ${done ? "text-gray-900" : "text-gray-400"}">${escapeHtml(s.label)}</p>
          <p class="text-[10px] text-gray-400">${done ? "Sudah lewati / Aktif" : "Belum dicapai"}</p>
        </div>
        ${
          order.status === s.key
            ? `<span class="text-[10px] bg-blue-50 text-[--color-primary] px-2 py-0.5 rounded font-semibold">Status Saat Ini</span>`
            : `<button onclick="updateStatusFromModal('${escapeHtml(order.id)}', '${s.key}')" class="text-[11px] border border-gray-200 hover:border-[--color-primary] px-2 py-1 rounded text-gray-600 hover:text-[--color-primary]">Set Status</button>`
        }
      </div>`;
  }).join("");

  const itemsList = order.items
    .map((i) => `<div class="flex justify-between text-xs py-1"><span class="text-gray-600">${escapeHtml(i.name)} x${i.qty}</span><span class="font-bold text-gray-800">${rupiah(i.subtotal)}</span></div>`)
    .join("");

  const proofHtml = order.proof
    ? `<div class="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
        <p class="text-xs font-semibold text-emerald-700 mb-2">Bukti Pembayaran Terunggah:</p>
        <img src="${getProofSrc(order.proof)}" class="w-36 h-36 object-cover rounded-lg border border-gray-200 mx-auto cursor-pointer shadow-sm" onclick="document.getElementById('lightbox-img').src=this.src; document.getElementById('lightbox').classList.remove('hidden');" />
      </div>`
    : `<p class="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-2.5 mt-3 text-center">Pembeli belum mengunggah foto bukti transfer.</p>`;

  const modalContent = document.getElementById("tracking-modal-content");
  modalContent.innerHTML = `
    <div class="text-left">
      <div class="flex items-center justify-between mb-3 border-b border-gray-100 pb-3">
        <div>
          <span class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Tracking Order</span>
          <h3 class="font-black text-lg text-[--color-primary]">#${escapeHtml(order.id)}</h3>
        </div>
        <span class="text-xs font-semibold px-3 py-1 rounded-full ${statusBadgeClass(order.status)}">${escapeHtml(STATUS_FLOW.find(s => s.key === order.status)?.label || order.status)}</span>
      </div>

      <div class="bg-gray-50 rounded-xl p-3 mb-4 space-y-1 text-xs">
        <p class="text-gray-700"><b>Nama Pemesan:</b> ${escapeHtml(order.customer.name)}</p>
        <p class="text-gray-700"><b>Nomor WA:</b> <a href="https://wa.me/${escapeHtml(order.customer.wa.replace(/\D/g, ''))}" target="_blank" class="text-emerald-600 underline font-semibold">${escapeHtml(order.customer.wa)}</a></p>
        <p class="text-gray-700"><b>Instansi:</b> ${escapeHtml(order.customer.instansi)}</p>
        <p class="text-gray-700"><b>Metode / Lokasi:</b> ${escapeHtml(order.customer.method)}${order.customer.detail ? " — " + escapeHtml(order.customer.detail) : ""}</p>
        <p class="text-gray-400 text-[11px]">Waktu Pesan: ${new Date(order.createdAt).toLocaleString("id-ID")}</p>
      </div>

      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tahapan Tracking Pesanan</h4>
      <div class="bg-white rounded-xl border border-gray-100 p-2 mb-4 shadow-sm">${steps}</div>

      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Item Terpesan</h4>
      <div class="bg-gray-50 rounded-xl p-3 mb-2">${itemsList}
        <div class="border-t border-gray-200 mt-2 pt-2 flex justify-between font-bold text-sm">
          <span>Total Bayar</span><span class="text-[--color-primary]">${rupiah(order.total)}</span>
        </div>
      </div>

      ${proofHtml}
    </div>
  `;

  document.getElementById("tracking-modal").classList.remove("hidden");
}

window.updateStatusFromModal = async function (orderId, newStatus) {
  await updateOrderStatus(orderId, newStatus);
  openTrackingModal(orderId);
};

document.getElementById("close-tracking-modal").addEventListener("click", () => {
  document.getElementById("tracking-modal").classList.add("hidden");
});

// Event Listeners for Tabs
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

document.getElementById("admin-search").addEventListener("input", applyFilters);
document.getElementById("status-filter").addEventListener("change", applyFilters);
if (document.getElementById("bank-filter")) {
  document.getElementById("bank-filter").addEventListener("change", applyFilters);
}
document.getElementById("refresh-btn").addEventListener("click", loadAll);

document.getElementById("export-btn").addEventListener("click", async () => {
  try {
    const res = await fetch("/api/admin/orders/export.csv", { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error("Gagal mengunduh file export.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rekap-pesanan-aptirmiki-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  }
});

// Init
if (TOKEN) {
  showDashboard();
} else {
  showLogin();
}
