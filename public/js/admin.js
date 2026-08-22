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

let adminLiveSyncTimer = null;
let lastKnownOrdersChecksum = "";

function stopAdminLiveSync() {
  if (adminLiveSyncTimer) {
    clearInterval(adminLiveSyncTimer);
    adminLiveSyncTimer = null;
  }
}

function startAdminLiveSync() {
  stopAdminLiveSync();
  adminLiveSyncTimer = setInterval(async () => {
    if (!TOKEN || currentTab === "products") return;
    try {
      const [ordersData, summaryData] = await Promise.all([
        Api.get("/api/admin/orders", { token: TOKEN }),
        Api.get("/api/admin/summary", { token: TOKEN }),
      ]);
      const currentChecksum = ordersData.orders.map((o) => `${o.id}:${o.status}:${Boolean(o.proof)}`).join("|");
      if (lastKnownOrdersChecksum && currentChecksum !== lastKnownOrdersChecksum) {
        ALL_ORDERS = ordersData.orders;
        updateTabBadges();
        renderSummaryCards(summaryData, ALL_ORDERS);
        renderBankSummaryCards(summaryData.bankSummary || []);
        renderBrandSummary(summaryData.brandSummary || []);
        renderRestock(summaryData.summary);
        applyFilters();
      }
      lastKnownOrdersChecksum = currentChecksum;
    } catch (e) {}
  }, 4000);
}

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
  updatePrivacyModeUI();
  updateOverviewPanelUI();
  loadAll();
  startAdminLiveSync();
}

function showLogin(message) {
  stopAdminLiveSync();
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
    populateBrandFilter();
    updateTabBadges();
    renderSummaryCards(summaryData, ALL_ORDERS);
    renderBankSummaryCards(summaryData.bankSummary || []);
    renderBrandSummary(summaryData.brandSummary || [], summaryData.summary || []);
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

function populateBrandFilter() {
  const sel = document.getElementById("brand-filter");
  if (!sel) return;
  const currentVal = sel.value;
  const brands = Array.from(
    new Set([
      ...ALL_PRODUCTS.map((p) => p.brand || "Umum"),
      ...ALL_ORDERS.flatMap((o) => o.items.map((i) => i.brand || "Umum")),
    ])
  ).filter(Boolean).sort();

  sel.innerHTML = '<option value="">Semua Brand Supplier</option>' +
    brands.map((b) => `<option value="${escapeHtml(b)}" ${b === currentVal ? "selected" : ""}>${escapeHtml(b)}</option>`).join("");
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
      value: `${summaryData.totalOrders || 0} Transaksi`,
      sub: "Semua pesanan",
      color: "text-gray-900",
      bg: "bg-blue-50 text-[--color-primary] border border-blue-100",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>`,
      isMoney: false,
    },
    {
      label: "Total Omset",
      value: rupiah(summaryData.totalRevenue || 0),
      sub: "Penjualan kotor",
      color: "text-[--color-primary]",
      bg: "bg-blue-50 text-[--color-primary] border border-blue-100",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="2" y1="10" x2="22" y2="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="15" r="1" fill="currentColor"/></svg>`,
      isMoney: true,
    },
    {
      label: "Modal Supplier",
      value: rupiah(summaryData.totalCost || 0),
      sub: "Beban pokok beli",
      color: "text-amber-700",
      bg: "bg-amber-50 text-amber-600 border border-amber-100",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`,
      isMoney: true,
    },
    {
      label: "Laba Panitia",
      value: rupiah(summaryData.totalProfit || 0),
      sub: "Keuntungan bersih",
      color: "text-emerald-700",
      bg: "bg-emerald-50 text-emerald-600 border border-emerald-100",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>`,
      isMoney: true,
    },
    {
      label: "Margin Laba",
      value: `${summaryData.profitMarginPercent || 0}%`,
      sub: "Persentase profit",
      color: "text-indigo-700",
      bg: "bg-indigo-50 text-indigo-600 border border-indigo-100",
      icon: `<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path stroke-linecap="round" stroke-linejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>`,
      isMoney: true,
    },
  ];

  document.getElementById("summary-cards").innerHTML = cards
    .map(
      (c) => `<div class="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center justify-between hover:shadow-md transition">
        <div>
          <p class="text-xs text-gray-500 font-medium mb-1">${c.label}</p>
          <p class="font-black text-base sm:text-xl ${c.color} leading-tight ${c.isMoney ? "privacy-mask" : ""}">${c.value}</p>
          <p class="text-[10px] text-gray-400 mt-0.5">${c.sub}</p>
        </div>
        <div class="w-11 h-11 rounded-2xl ${c.bg} shrink-0 ml-2 flex items-center justify-center shadow-2xs">${c.icon}</div>
      </div>`
    )
    .join("");
}

function renderBankSummaryCards(bankSummary = []) {
  const container = document.getElementById("bank-summary-cards");
  if (!container) return;

  const validBanks = bankSummary.filter((b) => b.bank !== "Lainnya" || b.count > 0);

  const colorMap = {
    BCA: { bg: "bg-blue-50/50 border-blue-100", badge: "bg-blue-600 text-white", text: "text-blue-900" },
    BSI: { bg: "bg-emerald-50/50 border-emerald-100", badge: "bg-emerald-600 text-white", text: "text-emerald-900" },
    Mandiri: { bg: "bg-amber-50/50 border-amber-100", badge: "bg-amber-600 text-white", text: "text-amber-900" },
    Lainnya: { bg: "bg-purple-50/50 border-purple-100", badge: "bg-purple-600 text-white", text: "text-purple-900" },
  };

  container.className = `grid grid-cols-1 sm:grid-cols-${Math.min(validBanks.length, 3)} lg:grid-cols-${validBanks.length} gap-3 mb-4`;

  container.innerHTML = validBanks
    .map((b) => {
      const theme = colorMap[b.bank] || colorMap.Lainnya;
      return `
      <div class="bg-white rounded-2xl border ${theme.bg} p-4 shadow-sm flex flex-col justify-between transition hover:shadow-md">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold px-2.5 py-0.5 rounded-lg ${theme.badge}">Bank ${escapeHtml(b.bank)}</span>
          <span class="text-xs text-gray-500 font-medium">${b.count} Transaksi</span>
        </div>
        <div class="mb-3">
          <p class="text-[11px] text-gray-400 font-medium">Uang Masuk</p>
          <p class="font-black text-xl sm:text-2xl ${theme.text} leading-tight privacy-mask">${rupiah(b.totalRevenue)}</p>
        </div>
        <div class="flex items-center gap-1.5 pt-2 border-t border-gray-100">
          <button onclick="filterByBank('${escapeHtml(b.bank)}')" class="flex-1 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 py-1.5 rounded-xl text-xs font-medium shadow-2xs transition active:scale-95 flex items-center justify-center gap-1">
            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Filter Pesanan</span>
          </button>
          <button onclick="downloadBankCsv('${escapeHtml(b.bank)}')" class="px-2.5 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-medium shadow-2xs transition active:scale-95 flex items-center gap-1" title="Export CSV Bank ${escapeHtml(b.bank)}">
            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span>CSV</span>
          </button>
        </div>
      </div>`;
    })
    .join("");
}

window.filterByBank = function (bankName) {
  const bankSelect = document.getElementById("bank-filter");
  if (bankSelect) {
    bankSelect.value = bankName;
    applyFilters();
  }
};

window.downloadBankCsv = function (bankName) {
  downloadCsvFile(`/api/admin/orders/export.csv?bank=${encodeURIComponent(bankName)}`, `rekap-pesanan-${bankName}-${Date.now()}.csv`);
};

const SUPPLIER_CONTACTS = {
  "Kartika Sari": {
    name: "Sales Kartika Sari Bandung",
    phone: "6285174158201",
    display: "+62 851-7415-8201",
  },
  "MAMADEE": {
    name: "Sales MAMADEE (Kopi)",
    phone: "6281907773467",
    display: "+62 819-0777-3467",
  },
};

function getSupplierContact(brandName) {
  const norm = String(brandName || "").toLowerCase().trim();
  for (const [key, val] of Object.entries(SUPPLIER_CONTACTS)) {
    if (key.toLowerCase().trim() === norm || norm.includes(key.toLowerCase().trim())) {
      return val;
    }
  }
  return null;
}

function renderBrandSummary(brandSummary, rawSummary = []) {
  const container = document.getElementById("brand-summary");
  if (!container) return;

  if (!brandSummary || brandSummary.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-400">Belum ada data transaksi brand.</p>`;
    return;
  }

  container.innerHTML = brandSummary
    .map((bs) => {
      const contact = getSupplierContact(bs.brand);

      // Find items belonging to this brand
      const brandItems = rawSummary.filter((p) => (p.brand || "Umum").toLowerCase() === bs.brand.toLowerCase() && p.totalQty > 0);
      const itemsListHtml = brandItems.length
        ? `<div class="bg-gray-50/70 rounded-xl p-2.5 my-2.5 space-y-1 text-xs border border-gray-100">
            <p class="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Rincian Item Terpesan:</p>
            ${brandItems.map((item, idx) => `
              <div class="flex justify-between items-center py-0.5 border-b border-gray-100 last:border-0">
                <span class="text-gray-700 font-medium">${idx + 1}. ${escapeHtml(item.name)} <b class="text-gray-900">x${item.totalQty} ${escapeHtml(item.unit || "box")}</b></span>
                <span class="text-amber-700 font-mono font-medium privacy-mask">${rupiah(item.totalCost)}</span>
              </div>
            `).join("")}
          </div>`
        : `<p class="text-[11px] text-gray-400 my-2">Belum ada item terpesan pada brand ini.</p>`;

      const contactBadge = contact
        ? `<a href="https://wa.me/${contact.phone}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 font-semibold transition" title="Buka Chat WhatsApp Supplier">
            <svg class="w-3 h-3 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-0.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            <span>WA PO: ${contact.display}</span>
          </a>`
        : "";

      return `
      <div class="bg-white rounded-2xl border border-gray-100 p-4 shadow-xs mb-3 hover:shadow-sm transition">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-[--color-primary]"></span>
            <h4 class="font-bold text-sm sm:text-base text-gray-900">${escapeHtml(bs.brand)}</h4>
            <span class="text-xs bg-gray-100 text-gray-700 font-semibold px-2 py-0.5 rounded-lg border border-gray-200">${bs.totalQty} pcs</span>
            ${contactBadge}
          </div>
          <div class="text-right">
            <span class="text-[11px] text-gray-400">Modal Supplier:</span>
            <span class="font-bold text-sm text-amber-700 ml-1 privacy-mask">${rupiah(bs.totalCost)}</span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 bg-gray-50 p-2.5 rounded-xl text-center text-xs mb-2 border border-gray-100">
          <div>
            <p class="text-[10px] text-gray-500">Omset</p>
            <p class="font-bold text-gray-900 privacy-mask">${rupiah(bs.totalRevenue)}</p>
          </div>
          <div>
            <p class="text-[10px] text-gray-500">Modal</p>
            <p class="font-bold text-amber-700 privacy-mask">${rupiah(bs.totalCost)}</p>
          </div>
          <div>
            <p class="text-[10px] text-gray-500">Laba Panitia</p>
            <p class="font-bold text-emerald-700 privacy-mask">${rupiah(bs.totalProfit)}</p>
          </div>
        </div>

        ${itemsListHtml}

        <div class="flex flex-wrap items-center gap-2 pt-1">
          ${
            contact
              ? `<button onclick="sendSupplierPoWa('${escapeHtml(bs.brand)}')" class="bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 rounded-xl text-xs font-semibold shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5" title="Kirim Rekap PO langsung ke WA Supplier ${escapeHtml(bs.brand)}">
                  <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-0.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                  <span>Kirim PO WA</span>
                </button>`
              : ""
          }
          <button onclick="copySupplierPo('${escapeHtml(bs.brand)}')" class="bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-xl text-xs font-semibold shadow-2xs transition active:scale-95 flex items-center justify-center gap-1.5" title="Salin Teks Format PO">
            <svg class="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            <span>Salin PO</span>
          </button>
          <button onclick="filterByBrand('${escapeHtml(bs.brand)}')" class="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 py-2 px-3 rounded-xl text-xs font-medium shadow-2xs transition flex items-center gap-1">
            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Filter Pesanan</span>
          </button>
          <button onclick="downloadSupplierCsv('${escapeHtml(bs.brand)}')" class="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 py-2 px-3 rounded-xl text-xs font-medium shadow-2xs transition flex items-center gap-1" title="Download Excel PO Khusus ${escapeHtml(bs.brand)}">
            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span>Export PO (CSV)</span>
          </button>
        </div>
      </div>`;
    })
    .join("");
}

window.filterByBrand = function (brandName) {
  const brandSelect = document.getElementById("brand-filter");
  if (brandSelect) {
    brandSelect.value = brandName;
    applyFilters();
  }
};

window.downloadSupplierCsv = function (brandName) {
  const param = brandName ? `&brand=${encodeURIComponent(brandName)}` : "";
  downloadCsvFile(`/api/admin/orders/export.csv?type=supplier${param}`, `rekap-po-supplier-${brandName || "semua"}-${Date.now()}.csv`);
};

function generateSupplierPoMessage(brandName) {
  const brandOrders = ALL_ORDERS.filter((o) => o.items.some((i) => (i.brand || "Umum").toLowerCase() === brandName.toLowerCase()));
  const itemMap = {};
  let totalBrandQty = 0;
  let totalBrandCost = 0;

  for (const order of brandOrders) {
    for (const item of order.items) {
      if ((item.brand || "Umum").toLowerCase() === brandName.toLowerCase()) {
        const prod = ALL_PRODUCTS.find((p) => p.id === item.productId) || {};
        const suppPrice = prod.supplierPrice !== undefined ? Number(prod.supplierPrice) : Math.round(Number(item.price) * 0.7);
        if (!itemMap[item.name]) {
          itemMap[item.name] = { name: item.name, unit: item.unit || "box", qty: 0, suppPrice, totalCost: 0 };
        }
        itemMap[item.name].qty += item.qty;
        itemMap[item.name].totalCost += suppPrice * item.qty;
        totalBrandQty += item.qty;
        totalBrandCost += suppPrice * item.qty;
      }
    }
  }

  const itemsLines = Object.values(itemMap)
    .map((item, idx) => `${idx + 1}. *${item.name}* : ${item.qty} ${item.unit} (Modal: ${rupiah(item.totalCost)})`)
    .join("\n");

  const msg = `Halo Sales *${brandName}*,
Berikut Rekap Pemesanan (Purchase Order / PO) dari Panitia Acara *APTIRMIKI*:

📋 *DAFTAR ITEM TERPESAN:*
${itemsLines || "Belum ada item terpesan."}

📦 *TOTAL JUMLAH ITEM:* ${totalBrandQty} item
💰 *ESTIMASI TOTAL BIAYA MODAL:* ${rupiah(totalBrandCost)}

Mohon segera diproses dan dikonfirmasi untuk kesiapan pengirimannya ke lokasi acara. Terima kasih banyak! 🙏`;

  return { msg, totalBrandQty, totalBrandCost };
}

window.sendSupplierPoWa = function (brandName) {
  const contact = getSupplierContact(brandName);
  const { msg } = generateSupplierPoMessage(brandName);
  const phone = contact ? contact.phone : "";
  if (!phone) {
    window.copySupplierPo(brandName);
    return;
  }
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, "_blank");
};

window.copySupplierPo = function (brandName) {
  const { msg } = generateSupplierPoMessage(brandName);
  navigator.clipboard.writeText(msg).then(() => {
    showSuccessModal({
      title: "Format WA Tersalin!",
      message: `Format Purchase Order (PO) untuk supplier "${brandName}" berhasil disalin. Silakan paste dan kirimkan langsung ke WhatsApp Sales Supplier.`,
    });
  }).catch(() => {
    alert("Gagal menyalin format WA.");
  });
};

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
      <span class="w-28 text-right text-gray-500 font-medium">Modal: <span class="privacy-mask font-semibold text-gray-700">${rupiah(s.totalCost || 0)}</span></span>
      <span class="w-28 text-right text-emerald-600 font-bold">Laba: <span class="privacy-mask">${rupiah(s.totalProfit || 0)}</span></span>
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
  const brandFilter = document.getElementById("brand-filter") ? document.getElementById("brand-filter").value : "";

  // Sync Bank quick chips UI
  document.querySelectorAll(".bank-chip").forEach((btn) => {
    const b = btn.dataset.quickBank;
    const isActive = b === bankFilter;
    if (isActive) {
      btn.className = "bank-chip px-3 py-1 rounded-full text-xs font-bold border bg-[--color-primary] text-white border-[--color-primary] shadow-xs transition";
    } else {
      btn.className = "bank-chip px-3 py-1 rounded-full text-xs font-semibold border bg-white text-gray-600 border-gray-200 hover:border-blue-400 transition";
    }
  });

  const filtered = ALL_ORDERS.filter((o) => {
    if (currentTab === "active" && o.status === "selesai") return false;
    if (currentTab === "completed" && o.status !== "selesai") return false;

    const matchStatus = !statusFilter || o.status === statusFilter;
    const matchBank = !bankFilter || (o.customer && o.customer.targetBank === bankFilter);
    const matchBrand = !brandFilter || o.items.some((i) => (i.brand || "Umum") === brandFilter);

    const itemsText = o.items.map((i) => `${i.name} ${i.brand || ""}`).join(" ");
    const haystack = `${o.id} ${o.customer.name} ${o.customer.wa} ${o.customer.instansi} ${o.customer.targetBank || ""} ${o.customer.method} ${o.customer.detail || ""} ${itemsText}`.toLowerCase();
    const matchQuery = !q || haystack.includes(q);

    return matchStatus && matchBank && matchBrand && matchQuery;
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
        <td class="px-3 py-3 font-bold whitespace-nowrap text-gray-900 privacy-mask">${rupiah(o.total)}</td>
        <td class="px-3 py-3">${proofCell}</td>
        <td class="px-3 py-3">${miniTrackingProgressBar(o.status)}</td>
        <td class="px-3 py-3">
          <div class="flex flex-wrap items-center gap-1.5">
          <select data-order-id="${o.id}" class="status-select text-xs rounded-lg px-2.5 py-1.5 font-semibold cursor-pointer focus:ring-2 focus:ring-blue-200 transition ${statusBadgeClass(o.status)}">
            ${statusOptions}
          </select>
          <button data-delete-id="${o.id}" class="delete-btn text-xs text-red-600 hover:text-red-700 font-semibold px-2.5 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition">Hapus</button>
          </div>
        </td>
        <td class="px-3 py-3 text-right whitespace-nowrap space-x-1">
          <button data-edit-order="${o.id}" class="edit-order-btn text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold px-2.5 py-1 rounded-lg border border-indigo-200 transition">Edit</button>
          <button data-track-id="${o.id}" class="track-detail-btn text-xs bg-blue-50 text-[--color-primary] hover:bg-blue-100 font-semibold px-2.5 py-1 rounded-lg border border-blue-200 transition">Tracking</button>
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

  tbody.querySelectorAll(".edit-order-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openEditOrderModal(btn.dataset.editOrder);
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
            await loadAll();
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

function getProofSrc(proof) {
  if (!proof) return "";
  if (proof.dataUrl) return proof.dataUrl;
  if (proof.filename) return `/uploads/${encodeURIComponent(proof.filename)}`;
  return "";
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

    const booked = ALL_ORDERS
      .filter((o) => o.status !== "dibatalkan")
      .reduce((sum, o) => {
        const found = (o.items || []).find((it) => String(it.productId || it.id).toLowerCase().trim() === String(p.id).toLowerCase().trim());
        return sum + (found ? Number(found.qty) || 0 : 0);
      }, 0);
    const remaining = typeof p.stock === "number" ? Math.max(0, p.stock - booked) : null;

    return `
    <tr class="border-t border-gray-100 align-middle hover:bg-gray-50/60 transition">
      <td class="px-3 py-3">
        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(p.name)}" class="w-12 h-12 object-cover rounded-lg border border-gray-200 shadow-sm" onerror="this.src='https://via.placeholder.com/100?text=Foto+Produk'" />
      </td>
      <td class="px-3 py-3">
        <p class="font-semibold text-gray-900">${escapeHtml(p.name)}</p>
        <div class="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span class="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-bold border border-purple-100">${escapeHtml(p.brand || "Betawi Asli")}</span>
          ${typeof p.stock === "number" ? `<span class="text-[10px] bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md font-bold border border-rose-200">Sisa: ${remaining} buku (Terpesan: ${booked})</span>` : ""}
        </div>
      </td>
      <td class="px-3 py-3 text-xs"><span class="bg-blue-50 text-[--color-primary] px-2 py-1 rounded-full font-semibold border border-blue-100">${escapeHtml(p.category)}</span></td>
      <td class="px-3 py-3 font-semibold text-amber-700 whitespace-nowrap">${rupiah(suppPrice)}</td>
      <td class="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">${rupiah(sellPrice)} <span class="text-xs font-normal text-gray-400">/${escapeHtml(p.unit)}</span></td>
      <td class="px-3 py-3 whitespace-nowrap">
        <span class="font-bold text-emerald-700">${rupiah(profit)}</span>
        <span class="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-mono font-semibold ml-1 border border-emerald-100">+${margin}%</span>
      </td>
      <td class="px-3 py-3 text-xs text-gray-600 space-y-1">
        <div class="inline-flex items-center gap-1.5 font-medium text-gray-700">
          <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          <span>${escapeHtml(p.origin || "Bandung")}</span>
        </div>
        <div class="flex items-center gap-1.5 text-amber-800 text-[11px] font-medium">
          <svg class="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
          <span>${escapeHtml(p.expiryDetail || "Tahan Lama")}</span>
        </div>
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
            ALL_PRODUCTS = ALL_PRODUCTS.filter((p) => p.id !== id);
            renderProductsTable();
            showSuccessModal({ title: "Produk Dihapus!", message: `Produk "${prod?.name || id}" telah berhasil dihapus.` });
            await loadAll();
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

  // Populate dynamic category datalist from current products
  const datalist = document.getElementById("category-datalist");
  if (datalist && ALL_PRODUCTS.length > 0) {
    const catSet = new Set(ALL_PRODUCTS.map((p) => p.category).filter(Boolean));
    datalist.innerHTML = Array.from(catSet)
      .sort()
      .map((c) => `<option value="${escapeHtml(c)}"></option>`)
      .join("");
  }

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
    if (document.getElementById("prod-stock")) document.getElementById("prod-stock").value = typeof p.stock === "number" ? p.stock : "";
    document.getElementById("prod-origin").value = p.origin || "";
    document.getElementById("prod-expiry").value = p.expiryDetail || "";
    document.getElementById("prod-desc").value = p.description || "";
    document.getElementById("prod-image").value = p.image || "";
  } else {
    document.getElementById("product-modal-title").textContent = "Tambah Produk Baru";
    form.reset();
    document.getElementById("prod-id").value = "";
    if (document.getElementById("prod-stock")) document.getElementById("prod-stock").value = "";
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
  const stockInput = document.getElementById("prod-stock") ? document.getElementById("prod-stock").value.trim() : "";
  const payload = {
    name: document.getElementById("prod-name").value,
    brand: document.getElementById("prod-brand") ? document.getElementById("prod-brand").value : "Betawi Asli",
    category: document.getElementById("prod-category").value,
    price: parseRupiahInput(document.getElementById("prod-price").value),
    supplierPrice: parseRupiahInput(document.getElementById("prod-supplier-price").value),
    unit: document.getElementById("prod-unit").value,
    stock: stockInput !== "" ? Number(stockInput) : null,
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
      const res = await Api.put(`/api/admin/products/${encodeURIComponent(id)}`, payload, { token: TOKEN });
      if (res && res.product) {
        const pIdx = ALL_PRODUCTS.findIndex((p) => p.id === id);
        if (pIdx !== -1) ALL_PRODUCTS[pIdx] = res.product;
      }
      showSuccessModal({ title: "Produk Diperbarui!", message: `Data produk "${payload.name}" berhasil disimpan.` });
    } else {
      const res = await Api.post("/api/admin/products", payload, { token: TOKEN });
      if (res && res.product) ALL_PRODUCTS.push(res.product);
      showSuccessModal({ title: "Produk Ditambahkan!", message: `Produk "${payload.name}" berhasil ditambahkan ke katalog.` });
    }
    document.getElementById("product-modal").classList.add("hidden");
    await loadAll();
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
    const res = await Api.patch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, { status: newStatus }, { token: TOKEN });
    if (res && res.order) {
      const order = ALL_ORDERS.find((o) => o.id === orderId);
      if (order) {
        order.status = res.order.status;
        order.updatedAt = res.order.updatedAt;
      }
    }
    lastKnownOrdersChecksum = ALL_ORDERS.map((o) => `${o.id}:${o.status}:${Boolean(o.proof)}`).join("|");
    updateTabBadges();
    applyFilters();
    showSuccessModal({ title: "Status Diperbarui!", message: `Status pesanan #${orderId} telah diperbarui.` });
  } catch (err) {
    alert("Gagal update status: " + err.message);
  } finally {
    if (targetElement) targetElement.disabled = false;
  }
}

// ===== Edit Order Modal =====
function calcEditOrderTotal() {
  const itemsContainer = document.getElementById("edit-order-items");
  if (!itemsContainer) return 0;
  let total = 0;
  itemsContainer.querySelectorAll(".edit-item-row").forEach((row) => {
    const price = Number(row.dataset.price) || 0;
    const qty = Number(row.querySelector(".edit-item-qty")?.value) || 0;
    total += price * qty;
  });
  const previewEl = document.getElementById("edit-order-total-preview");
  if (previewEl) previewEl.textContent = rupiah(total);
  return total;
}

function openEditOrderModal(orderId) {
  const order = ALL_ORDERS.find((o) => o.id === orderId);
  if (!order) return;

  const modal = document.getElementById("edit-order-modal");
  if (!modal) return;

  // Subtitle
  const subtitle = document.getElementById("edit-order-subtitle");
  if (subtitle) subtitle.textContent = `#${order.id}`;

  // Hidden ID
  document.getElementById("edit-order-id").value = order.id;

  // Customer fields
  document.getElementById("edit-order-name").value = order.customer?.name || "";
  document.getElementById("edit-order-wa").value = order.customer?.wa || "";
  document.getElementById("edit-order-instansi").value = order.customer?.instansi || "";
  document.getElementById("edit-order-detail").value = order.customer?.detail || "";

  // Bank select
  const bankSel = document.getElementById("edit-order-target-bank");
  if (bankSel) bankSel.value = order.customer?.targetBank || "BCA";

  // Method select
  const methodSel = document.getElementById("edit-order-method");
  if (methodSel) {
    const methodVal = order.customer?.method || "Ambil di Booth";
    // Try to set; if option not found, add it temporarily
    methodSel.value = methodVal;
    if (methodSel.value !== methodVal) {
      const opt = document.createElement("option");
      opt.value = methodVal;
      opt.textContent = methodVal;
      methodSel.appendChild(opt);
      methodSel.value = methodVal;
    }
  }

  // Status select — populate from STATUS_FLOW
  const statusSel = document.getElementById("edit-order-status");
  if (statusSel) {
    statusSel.innerHTML = STATUS_FLOW.map(
      (s) => `<option value="${s.key}" ${s.key === order.status ? "selected" : ""}>${escapeHtml(s.label)}</option>`
    ).join("");
  }

  // Items list
  const itemsContainer = document.getElementById("edit-order-items");
  if (itemsContainer) {
    itemsContainer.innerHTML = order.items.map((item, idx) => `
      <div class="edit-item-row flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100" data-price="${Number(item.price) || 0}" data-idx="${idx}">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-gray-800 truncate">${escapeHtml(item.name)}</p>
          <p class="text-[11px] text-gray-400">${escapeHtml(item.brand || "Umum")} · ${rupiah(Number(item.price) || 0)} / ${escapeHtml(item.unit || "pcs")}</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" class="edit-item-dec w-6 h-6 rounded-lg bg-white border border-gray-200 hover:bg-red-50 hover:border-red-300 text-gray-600 font-bold text-sm flex items-center justify-center transition">−</button>
          <input type="number" min="1" max="99" value="${Number(item.qty) || 1}" class="edit-item-qty w-12 text-center border border-gray-200 rounded-lg py-1 text-sm font-bold focus:border-[--color-primary] outline-none" />
          <button type="button" class="edit-item-inc w-6 h-6 rounded-lg bg-white border border-gray-200 hover:bg-green-50 hover:border-green-300 text-gray-600 font-bold text-sm flex items-center justify-center transition">+</button>
        </div>
        <span class="edit-item-subtotal text-xs font-bold text-[--color-primary] w-20 text-right shrink-0">${rupiah((Number(item.price) || 0) * (Number(item.qty) || 1))}</span>
      </div>
    `).join("");

    // Bind +/- buttons and qty input
    itemsContainer.querySelectorAll(".edit-item-row").forEach((row) => {
      const qtyInput = row.querySelector(".edit-item-qty");
      const subtotalEl = row.querySelector(".edit-item-subtotal");
      const price = Number(row.dataset.price) || 0;

      const refreshSubtotal = () => {
        const qty = Math.max(1, Number(qtyInput.value) || 1);
        qtyInput.value = qty;
        subtotalEl.textContent = rupiah(price * qty);
        calcEditOrderTotal();
      };

      row.querySelector(".edit-item-dec").addEventListener("click", () => {
        qtyInput.value = Math.max(1, (Number(qtyInput.value) || 1) - 1);
        refreshSubtotal();
      });
      row.querySelector(".edit-item-inc").addEventListener("click", () => {
        qtyInput.value = Math.min(99, (Number(qtyInput.value) || 1) + 1);
        refreshSubtotal();
      });
      qtyInput.addEventListener("input", refreshSubtotal);
    });
  }

  calcEditOrderTotal();

  // Error reset
  const errEl = document.getElementById("edit-order-error");
  if (errEl) errEl.classList.add("hidden");

  modal.classList.remove("hidden");
}

// Submit handler for Edit Order form
document.getElementById("edit-order-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("edit-order-error");
  if (errEl) errEl.classList.add("hidden");

  const orderId = document.getElementById("edit-order-id").value;
  const order = ALL_ORDERS.find((o) => o.id === orderId);
  if (!order) return;

  // Collect updated items with quantities
  const itemsContainer = document.getElementById("edit-order-items");
  const updatedItems = [];
  itemsContainer?.querySelectorAll(".edit-item-row").forEach((row, idx) => {
    const origItem = order.items[idx];
    if (!origItem) return;
    const qty = Math.max(1, Number(row.querySelector(".edit-item-qty")?.value) || 1);
    updatedItems.push({
      productId: origItem.productId || origItem.id,
      name: origItem.name,
      brand: origItem.brand || "Umum",
      price: origItem.price,
      unit: origItem.unit || "pcs",
      qty,
      subtotal: (Number(origItem.price) || 0) * qty,
    });
  });

  const payload = {
    customer: {
      name: document.getElementById("edit-order-name").value.trim(),
      wa: document.getElementById("edit-order-wa").value.trim(),
      instansi: document.getElementById("edit-order-instansi").value.trim(),
      method: document.getElementById("edit-order-method").value,
      detail: document.getElementById("edit-order-detail").value.trim(),
      targetBank: document.getElementById("edit-order-target-bank").value,
    },
    status: document.getElementById("edit-order-status").value,
    items: updatedItems,
  };

  const saveBtn = document.getElementById("save-edit-order-btn");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Menyimpan..."; }

  try {
    const res = await Api.put(`/api/admin/orders/${encodeURIComponent(orderId)}`, payload, { token: TOKEN });
    if (res && res.order) {
      const idx = ALL_ORDERS.findIndex((o) => o.id === orderId);
      if (idx !== -1) ALL_ORDERS[idx] = res.order;
    }
    document.getElementById("edit-order-modal").classList.add("hidden");
    lastKnownOrdersChecksum = ALL_ORDERS.map((o) => `${o.id}:${o.status}:${Boolean(o.proof)}`).join("|");
    updateTabBadges();
    applyFilters();
    showSuccessModal({ title: "Pesanan Diperbarui!", message: `Data pesanan #${orderId} berhasil disimpan.` });
    await loadAll();
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    } else {
      alert("Gagal menyimpan: " + err.message);
    }
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Simpan Perubahan"; }
  }
});

// Close & Cancel Edit Order Modal
document.getElementById("close-edit-order-modal")?.addEventListener("click", () => {
  document.getElementById("edit-order-modal")?.classList.add("hidden");
});
document.getElementById("cancel-edit-order-modal")?.addEventListener("click", () => {
  document.getElementById("edit-order-modal")?.classList.add("hidden");
});

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
if (document.getElementById("brand-filter")) {
  document.getElementById("brand-filter").addEventListener("change", applyFilters);
}

// Bank Quick Filter Chips Click
document.querySelectorAll(".bank-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const bankVal = chip.dataset.quickBank;
    const bankSel = document.getElementById("bank-filter");
    if (bankSel) {
      bankSel.value = bankVal;
      applyFilters();
    }
  });
});

function showToast(message, type = "success") {
  const existing = document.getElementById("admin-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "admin-toast";
  toast.className = `fixed bottom-6 right-6 z-50 bg-gray-900/90 text-gray-100 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium backdrop-blur-md border border-gray-800/80 transition-all duration-300 transform translate-y-2 opacity-0 tracking-wide`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

document.getElementById("refresh-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("refresh-btn");
  const svg = btn ? btn.querySelector("svg") : null;
  if (svg) svg.classList.add("animate-spin", "text-[--color-primary]");
  if (btn) btn.classList.add("opacity-70", "pointer-events-none");

  try {
    await loadAll();
    showToast("Data pesanan & rekapitulasi berhasil diperbarui");
  } catch (err) {
    showToast("Gagal memperbarui data: " + err.message, "error");
  } finally {
    if (svg) svg.classList.remove("animate-spin", "text-[--color-primary]");
    if (btn) btn.classList.remove("opacity-70", "pointer-events-none");
  }
});

document.getElementById("clear-orders-btn")?.addEventListener("click", () => {
  showConfirmModal({
    title: "Kosongkan Semua Pesanan?",
    message: "Apakah Anda yakin ingin MENGHAPUS SEMUA DATA PESANAN yang ada? Tindakan ini akan mengosongkan rekapitulasi agar siap menerima data pesanan asli besok.",
    confirmText: "Ya, Kosongkan Semua Pesanan",
    onConfirm: async () => {
      try {
        await Api.post("/api/admin/orders/clear-all", {}, { token: TOKEN });
        ALL_ORDERS = [];
        showSuccessModal({
          title: "Rekapitulasi Dikosongkan!",
          message: "Seluruh data pesanan telah dibersihkan. Sistem siap menerima pesanan baru!",
        });
        await loadAll();
      } catch (err) {
        alert("Gagal mengosongkan pesanan: " + err.message);
      }
    },
  });
});

// Helper for CSV downloading
window.downloadCsvFile = async function (endpoint, fallbackFilename) {
  try {
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error("Gagal mengunduh file export CSV.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fallbackFilename || `rekap-aptirmiki-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Download Error: " + err.message);
  }
};

// Export Modal Toggle & Options
const exportBtn = document.getElementById("export-btn");
const exportModal = document.getElementById("export-modal");
const closeExportBtn = document.getElementById("close-export-modal");

if (exportBtn && exportModal) {
  exportBtn.addEventListener("click", () => {
    exportModal.classList.remove("hidden");
  });
}
if (closeExportBtn && exportModal) {
  closeExportBtn.addEventListener("click", () => {
    exportModal.classList.add("hidden");
  });
}

// Export modal option clicks
document.querySelectorAll("[data-export-opt]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const opt = btn.dataset.exportOpt;
    const bank = btn.dataset.bank;
    if (exportModal) exportModal.classList.add("hidden");

    if (opt === "bank" && bank) {
      await downloadCsvFile(`/api/admin/orders/export.csv?bank=${encodeURIComponent(bank)}`, `rekap-pesanan-${bank}-${Date.now()}.csv`);
    } else if (opt === "supplier") {
      await downloadCsvFile(`/api/admin/orders/export.csv?type=supplier`, `rekap-po-supplier-${Date.now()}.csv`);
    } else {
      await downloadCsvFile(`/api/admin/orders/export.csv`, `rekap-pesanan-semua-${Date.now()}.csv`);
    }
  });
});

// ===== Manual Order / WhatsApp Order Modal Logic =====
let MANUAL_ORDER_ITEMS = [];

function openManualOrderModal() {
  const modal = document.getElementById("manual-order-modal");
  if (!modal) return;

  // Reset form
  document.getElementById("manual-order-name").value = "";
  document.getElementById("manual-order-wa").value = "";
  document.getElementById("manual-order-instansi").value = "";
  document.getElementById("manual-order-target-bank").value = "BCA";
  document.getElementById("manual-order-method").value = "Ambil di Booth";
  document.getElementById("manual-order-detail").value = "";
  
  const errEl = document.getElementById("manual-order-error");
  if (errEl) errEl.classList.add("hidden");

  MANUAL_ORDER_ITEMS = [];
  renderManualOrderItems();

  // Populate product dropdown
  const selectEl = document.getElementById("manual-item-select");
  if (selectEl && Array.isArray(ALL_PRODUCTS)) {
    selectEl.innerHTML = ALL_PRODUCTS.map(
      (p) => `<option value="${p.id}">${escapeHtml(p.name)} (${p.brand || "Umum"}) - ${rupiah(p.price)}</option>`
    ).join("");
  }

  modal.classList.remove("hidden");
}

function closeManualOrderModal() {
  const modal = document.getElementById("manual-order-modal");
  if (modal) modal.classList.add("hidden");
}

function renderManualOrderItems() {
  const container = document.getElementById("manual-order-items-list");
  const totalEl = document.getElementById("manual-order-total-preview");
  if (!container) return;

  if (MANUAL_ORDER_ITEMS.length === 0) {
    container.innerHTML = `<p class="text-xs text-gray-400 italic py-2 text-center bg-gray-50 rounded-lg">Belum ada produk yang ditambahkan.</p>`;
    if (totalEl) totalEl.textContent = rupiah(0);
    return;
  }

  let total = 0;
  container.innerHTML = MANUAL_ORDER_ITEMS.map((item, idx) => {
    const subtotal = (item.price || 0) * (item.qty || 1);
    total += subtotal;
    return `
      <div class="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-gray-800 truncate">${escapeHtml(item.name)}</p>
          <p class="text-[11px] text-gray-500">${escapeHtml(item.brand || "Umum")} · ${rupiah(item.price)} × ${item.qty} = <span class="font-bold text-emerald-700">${rupiah(subtotal)}</span></p>
        </div>
        <button type="button" data-del-manual-item="${idx}" class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition text-xs font-bold">
          ✕
        </button>
      </div>
    `;
  }).join("");

  if (totalEl) totalEl.textContent = rupiah(total);

  // Bind delete buttons
  container.querySelectorAll("[data-del-manual-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.delManualItem);
      MANUAL_ORDER_ITEMS.splice(idx, 1);
      renderManualOrderItems();
    });
  });
}

document.getElementById("add-manual-order-btn")?.addEventListener("click", openManualOrderModal);
document.getElementById("close-manual-order-modal")?.addEventListener("click", closeManualOrderModal);
document.getElementById("cancel-manual-order-modal")?.addEventListener("click", closeManualOrderModal);

document.getElementById("manual-add-item-btn")?.addEventListener("click", () => {
  const selectEl = document.getElementById("manual-item-select");
  const qtyInput = document.getElementById("manual-item-qty");
  if (!selectEl || !qtyInput) return;

  const prodId = selectEl.value;
  const qty = Math.max(1, Number(qtyInput.value) || 1);
  const prod = ALL_PRODUCTS.find((p) => p.id === prodId);
  if (!prod) return;

  const existing = MANUAL_ORDER_ITEMS.find((i) => i.productId === prod.id);
  if (existing) {
    existing.qty += qty;
  } else {
    MANUAL_ORDER_ITEMS.push({
      productId: prod.id,
      name: prod.name,
      brand: prod.brand || "Umum",
      price: Number(prod.price) || 0,
      unit: prod.unit || "pcs",
      qty: qty,
    });
  }

  qtyInput.value = 1;
  renderManualOrderItems();
});

document.getElementById("manual-order-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("manual-order-error");
  if (errEl) errEl.classList.add("hidden");

  if (MANUAL_ORDER_ITEMS.length === 0) {
    if (errEl) {
      errEl.textContent = "Silakan tambahkan minimal 1 produk ke dalam pesanan.";
      errEl.classList.remove("hidden");
    }
    return;
  }

  const name = document.getElementById("manual-order-name").value.trim();
  const wa = document.getElementById("manual-order-wa").value.trim();
  const instansi = document.getElementById("manual-order-instansi").value.trim();
  const targetBank = document.getElementById("manual-order-target-bank").value;
  const method = document.getElementById("manual-order-method").value;
  const detail = document.getElementById("manual-order-detail").value.trim();

  const payload = {
    customer: {
      name,
      wa,
      instansi,
      targetBank,
      method,
      detail,
    },
    items: MANUAL_ORDER_ITEMS.map((it) => ({
      productId: it.productId,
      qty: it.qty,
    })),
  };

  const saveBtn = document.getElementById("save-manual-order-btn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan...";
  }

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Gagal menyimpan pesanan");

    closeManualOrderModal();
    await loadAll();
    showSuccessModal({ title: "Pesanan Berhasil Dicatat!", message: `Pesanan #${result.id} a.n ${result.customer?.name} berhasil masuk rekap.` });
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
    }
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Simpan & Rekap Pesanan";
    }
  }
});

// ===== Privacy Mode & Overview Panel Toggle =====
let IS_PRIVACY_MODE = localStorage.getItem("admin_privacy_mode") === "1";
let IS_OVERVIEW_HIDDEN = localStorage.getItem("admin_overview_hidden") === "1";

function updatePrivacyModeUI() {
  document.body.classList.toggle("privacy-mode", IS_PRIVACY_MODE);
  const label = document.getElementById("privacy-btn-label");
  const btn = document.getElementById("toggle-privacy-btn");
  if (label) label.textContent = IS_PRIVACY_MODE ? "Buka Sensor" : "Sensor Nominal";
  if (btn) {
    btn.classList.toggle("bg-amber-50", IS_PRIVACY_MODE);
    btn.classList.toggle("text-amber-800", IS_PRIVACY_MODE);
    btn.classList.toggle("border-amber-200", IS_PRIVACY_MODE);
  }
}

function updateOverviewPanelUI() {
  const panel = document.getElementById("financial-overview-section");
  const label = document.getElementById("overview-btn-label");
  const icon = document.getElementById("overview-icon");
  const btn = document.getElementById("toggle-overview-btn");
  if (panel) {
    if (IS_OVERVIEW_HIDDEN) {
      panel.classList.add("hidden");
    } else {
      panel.classList.remove("hidden");
    }
  }
  if (label) label.textContent = IS_OVERVIEW_HIDDEN ? "Buka Ringkasan" : "Tutup Ringkasan";
  if (icon) icon.classList.toggle("rotate-180", IS_OVERVIEW_HIDDEN);
  if (btn) {
    btn.classList.toggle("bg-blue-50", IS_OVERVIEW_HIDDEN);
    btn.classList.toggle("text-[--color-primary]", IS_OVERVIEW_HIDDEN);
    btn.classList.toggle("border-blue-200", IS_OVERVIEW_HIDDEN);
  }
}

document.getElementById("toggle-privacy-btn")?.addEventListener("click", () => {
  IS_PRIVACY_MODE = !IS_PRIVACY_MODE;
  localStorage.setItem("admin_privacy_mode", IS_PRIVACY_MODE ? "1" : "0");
  updatePrivacyModeUI();
  showToast(IS_PRIVACY_MODE ? "Mode privasi aktif (nominal disensor)" : "Mode privasi nonaktif (nominal ditampilkan)");
});

document.getElementById("toggle-overview-btn")?.addEventListener("click", () => {
  IS_OVERVIEW_HIDDEN = !IS_OVERVIEW_HIDDEN;
  localStorage.setItem("admin_overview_hidden", IS_OVERVIEW_HIDDEN ? "1" : "0");
  updateOverviewPanelUI();
  showToast(IS_OVERVIEW_HIDDEN ? "Panel ringkasan disembunyikan" : "Panel ringkasan ditampilkan");
});

// Init
updatePrivacyModeUI();
updateOverviewPanelUI();

if (TOKEN) {
  showDashboard();
} else {
  showLogin();
}
