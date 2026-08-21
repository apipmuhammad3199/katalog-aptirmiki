// ===== State & Constants =====
let PRODUCTS = [];
let CATEGORIES = [];
let CONFIG = {};
let searchQuery = "";
let activeCategory = "Semua";

const CART_KEY = "aptirmiki_cart";
const MY_ORDERS_KEY = "aptirmiki_my_orders";
const app = document.getElementById("app");
let deadlineNoticeVisible = false;

const rupiah = (n) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

function isSundayWib() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date()) === "Sun";
}

// ===== Toast Notification =====
function showToast(msg) {
  const toast = document.getElementById("toast");
  const msgEl = document.getElementById("toast-msg");
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

// ===== Copy Helper =====
function copyText(text, label = "Teks") {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast(`${label} berhasil disalin! ✅`),
      () => fallbackCopy(text, label)
    );
  } else {
    fallbackCopy(text, label);
  }
}

function fallbackCopy(text, label) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast(`${label} berhasil disalin! ✅`);
  } catch (e) {
    showToast(`Gagal menyalin ${label}`);
  }
}

async function prepareProofFile(file) {
  if (!file || !file.type.startsWith("image/") || file.size <= 900 * 1024) return file;

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = imageUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "bukti-transfer.jpg", { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

// ===== WhatsApp Link Helper =====
function formatWaLink(num, message) {
  let clean = String(num || "").replace(/\D/g, "");
  if (clean.startsWith("0")) clean = "62" + clean.slice(1);
  if (!clean) clean = "6287714001013";
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}

// ===== Local Storage My Orders Tracker =====
function getMyOrders() {
  try {
    return JSON.parse(localStorage.getItem(MY_ORDERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}
function saveMyOrder(id) {
  if (!id) return;
  const list = getMyOrders().filter((item) => item !== id);
  list.unshift(id);
  localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(list.slice(0, 20)));
}

// ===== Cart helpers =====
function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch (e) {
    return {};
  }
}
function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}
function addToCart(productId, delta = 1) {
  const cart = getCart();
  const nextQty = (cart[productId] || 0) + delta;
  if (nextQty <= 0) {
    delete cart[productId];
  } else {
    cart[productId] = nextQty;
  }
  setCart(cart);
  showToast(delta > 0 ? "Ditambahkan ke keranjang 🛒" : "Keranjang diperbarui");
  return cart[productId] || 0;
}
function setQtyExact(productId, qty) {
  const cart = getCart();
  if (qty <= 0) delete cart[productId];
  else cart[productId] = qty;
  setCart(cart);
}
function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}
function cartDetailed() {
  const cart = getCart();
  return Object.entries(cart)
    .map(([productId, qty]) => {
      const product = PRODUCTS.find((p) => p.id === productId);
      if (!product) return null;
      return { product, qty, subtotal: product.price * qty };
    })
    .filter(Boolean);
}
function cartCount() {
  return Object.values(getCart()).reduce((a, b) => a + b, 0);
}
function cartTotal() {
  return cartDetailed().reduce((sum, item) => sum + item.subtotal, 0);
}
function updateCartBadge() {
  const badges = [
    document.getElementById("cart-badge"),
    document.getElementById("cart-badge-header"),
    document.getElementById("cart-badge-bottom"),
  ];
  const count = cartCount();
  badges.forEach((badge) => {
    if (!badge) return;
    badge.textContent = count;
    badge.classList.toggle("hidden", count === 0);
    badge.classList.remove("badge-bounce");
    void badge.offsetWidth;
    badge.classList.add("badge-bounce");
  });
}

// ===== Floating buttons & Mobile Bottom Nav visibility =====
function toggleFloatingButtons(show) {
  const cartFab = document.getElementById("cart-fab");
  const waFab = document.getElementById("wa-float");
  const bottomNav = document.getElementById("mobile-bottom-nav");
  [cartFab, waFab].forEach((el) => {
    if (el) {
      if (!show || window.innerWidth < 768) {
        el.classList.add("hidden");
      } else {
        el.classList.remove("hidden");
      }
    }
  });
  if (bottomNav) {
    bottomNav.classList.toggle("hidden", !show);
  }
}

// ===== Google Drive URL Converter & Image Helper =====
function convertDriveUrl(url) {
  if (!url || typeof url !== "string") return url || "";
  const trimmed = url.trim();

  // Match /file/d/FILE_ID/
  const fileIdMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
  }

  // Match uc?id=FILE_ID or open?id=FILE_ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
  }

  return trimmed;
}

window.handleImgError = function (img) {
  const wrap = img.parentElement;
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 p-2 text-center">
      <svg class="w-8 h-8 mb-1 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span class="text-[10px] font-medium text-gray-400">Foto Produk</span>
    </div>`;
};

function productImage(p, wrapperClass) {
  const src = convertDriveUrl(p.image);
  return `
    <div class="${wrapperClass} overflow-hidden bg-gray-100 shrink-0">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" loading="lazy"
        class="w-full h-full object-cover"
        onerror="handleImgError(this)" />
    </div>`;
}

// ===== Router =====
function navigate(hash) {
  window.location.hash = hash;
}
window.addEventListener("hashchange", render);

function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [path, ...rest] = hash.split("/");
  return { path: path || "katalog", params: rest.map(decodeURIComponent) };
}

async function refreshProducts() {
  try {
    const productData = await Api.get("/api/products");
    if (productData && Array.isArray(productData.products)) {
      PRODUCTS = productData.products;
      if (productData.categories) CATEGORIES = productData.categories;
      updateCartBadge();
    }
  } catch (e) {}
}

async function render() {
  const { path, params } = currentRoute();
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.classList.toggle("text-[--color-primary]", el.dataset.nav === path);
    el.classList.toggle("font-semibold", el.dataset.nav === path);
  });
  window.scrollTo({ top: 0, behavior: "instant" });

  if (path === "katalog" || path === "keranjang" || path === "checkout" || !path) {
    await refreshProducts();
  }

  if (path !== "tracking" && path !== "riwayat" && path !== "konfirmasi") {
    stopLiveSync();
  }

  if (path === "keranjang") {
    toggleFloatingButtons(false);
    return renderKeranjang();
  }
  if (path === "checkout") {
    toggleFloatingButtons(false);
    return renderCheckout();
  }
  if (path === "konfirmasi") {
    toggleFloatingButtons(true);
    renderKonfirmasi(params[0]);
    startLiveSync(async () => {
      try {
        const data = await Api.get(`/api/orders/${encodeURIComponent(params[0])}`);
        if (data && data.order) {
          const prevKey = `${data.order.id}_${data.order.status}_${Boolean(data.order.proof)}`;
          if (lastKnownStatusMap[data.order.id] && lastKnownStatusMap[data.order.id] !== prevKey) {
            const flowItem = (data.statusFlow || []).find((s) => s.key === data.order.status);
            showToast(`🔔 Status pesanan #${data.order.id} diperbarui: ${flowItem ? flowItem.label : data.order.status}`);
            renderKonfirmasi(params[0]);
          }
          lastKnownStatusMap[data.order.id] = prevKey;
        }
      } catch (e) {}
    }, 4000);
    return;
  }
  if (path === "tracking") {
    toggleFloatingButtons(true);
    return renderTracking(params[0], "tracking");
  }
  if (path === "riwayat") {
    toggleFloatingButtons(true);
    return renderTracking(params[0], "riwayat");
  }
  toggleFloatingButtons(true);
  return renderKatalog();
}

function setView(html) {
  app.innerHTML = `<div class="view-enter">${html}</div>`;
}

// ===== Katalog =====
function renderKatalog() {
  const brandTabs = [
    { id: "Semua", label: "Semua Produk" },
    { id: "Kartika Sari", label: "Kartika Sari Bandung" },
    { id: "MAMADEE", label: "Kopi MAMADEE" },
    { id: "Produk UMKM", label: "Kuliner & Sambal UMKM" },
  ];

  const chips = brandTabs
    .map(
      (t) => `
      <button data-action="filter-cat" data-cat="${escapeHtml(t.id)}"
        class="category-chip whitespace-nowrap px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm border font-semibold transition-all shrink-0 ${
          activeCategory === t.id
            ? "bg-[--color-primary] text-white border-[--color-primary] shadow-sm"
            : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
        }">
        ${escapeHtml(t.label)}
      </button>`
    )
    .join("");

  setView(`
    ${deadlineNoticeVisible ? `<div class="px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4">
      <div class="deadline-notice max-w-screen-2xl mx-auto overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-r from-[#0047ab] via-[#075ed2] to-[#1477e8] text-white shadow-lg shadow-blue-200/60" role="status">
        <div class="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div class="flex items-start gap-3.5">
            <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M10.3 3.5h3.4L21 17.2a1.5 1.5 0 01-1.3 2.3H4.3A1.5 1.5 0 013 17.2L10.3 3.5z" />
              </svg>
            </div>
            <div class="min-w-0">
              <div class="mb-1 flex flex-wrap items-center gap-2">
                <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100">Pemberitahuan penting</p>
                <span class="rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shadow-sm">Segera ditutup</span>
              </div>
              <p class="text-sm font-bold leading-snug sm:text-base">Batas akhir pemesanan oleh-oleh</p>
              <p class="mt-1 text-xs leading-relaxed text-blue-100 sm:text-sm">Pastikan pesanan Anda masuk sebelum batas waktu.</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 backdrop-blur-sm sm:min-w-[220px] sm:justify-center">
            <svg class="h-5 w-5 shrink-0 text-blue-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path stroke-linecap="round" d="M12 7v5l3 2" />
            </svg>
            <div>
              <p class="text-[10px] font-medium uppercase tracking-wider text-blue-100">Ditutup pada</p>
              <p class="text-sm font-bold leading-tight sm:text-base">Minggu, 23 Agustus</p>
              <p class="mt-0.5 text-xs font-semibold text-white">09.00 WIB</p>
            </div>
          </div>
        </div>
      </div>
    </div>` : ""}
    <div class="px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4 pb-2 sticky top-14 sm:top-16 z-20 bg-[--color-cream]/95 backdrop-blur">
      <div class="max-w-screen-2xl mx-auto">
        <div class="relative mb-2.5 sm:mb-3 max-w-md">
          <input id="search-input" type="text" placeholder="Cari oleh-oleh Kartika Sari, Kopi & Sambal UMKM..." value="${escapeHtml(searchQuery)}"
            class="w-full rounded-full border border-gray-200 bg-white pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 text-xs sm:text-sm shadow-sm focus:border-[--color-primary] focus:ring-2 focus:ring-blue-100" />
          <svg class="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <div class="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar touch-scroll pb-1 -mx-1 px-1">${chips}</div>
      </div>
    </div>
    <div class="px-3 sm:px-6 lg:px-8 py-2 sm:py-3 max-w-screen-2xl mx-auto pb-32" id="product-grid-container">
      ${renderProductGridHtml()}
    </div>
  `);

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      const gridContainer = document.getElementById("product-grid-container");
      if (gridContainer) {
        gridContainer.innerHTML = renderProductGridHtml();
      }
    });
  }
}

let SELECTED_VARIANTS = {};

function getMamadeeGroups(products) {
  const groups = [
    {
      id: "group-kopi-ace",
      name: "Kopi A.C.E (Aren Creamy Espresso)",
      category: "Minuman & Kopi MAMADEE",
      brand: "MAMADEE",
      origin: "MAMADEE Jakarta",
      expiryDetail: "3-4 hari di kulkas | 6-8 jam di suhu ruang",
      description: "Bold espresso berpadu sempurna dengan manisnya gula aren asli dan susu creamy yang lumer di mulut. Klasik, pas, dan anti enek! Sudah termasuk Cooler bag & ice gel.",
      image: "/images/products/kopi-ace.jpg",
      variants: [],
    },
    {
      id: "group-kopi-bce",
      name: "Kopi B.C.E (Butterscotch Creamy Espresso)",
      category: "Minuman & Kopi MAMADEE",
      brand: "MAMADEE",
      origin: "MAMADEE Jakarta",
      expiryDetail: "3-4 hari di kulkas | 6-8 jam di suhu ruang",
      description: "Sensasi ngopi mewah dengan aroma butterscotch yang wangi gurih dan tekstur creamy yang langsung bikin mood naik. Sudah termasuk Cooler bag & ice gel.",
      image: "/images/products/kopi-bce.png",
      variants: [],
    },
    {
      id: "group-cendol-end-to-end",
      name: "Cendol End-To-End",
      category: "Minuman & Kopi MAMADEE",
      brand: "MAMADEE",
      origin: "MAMADEE Jakarta",
      expiryDetail: "",
      description: "Cendol kekinian berbalut susu creamy, gula aren homemade, jelly kenyal, dan wangi buah nangka. Dijamin endul sampai tetesan terakhir! Sudah termasuk Cooler bag & ice gel.",
      image: "/images/products/cendol-end-to-end.png",
      variants: [],
    },
  ];

  products.forEach((p) => {
    if (p.id.includes("kopi-ace") || p.name.includes("A.C.E")) {
      groups[0].variants.push(p);
    } else if (p.id.includes("kopi-bce") || p.name.includes("B.C.E")) {
      groups[1].variants.push(p);
    } else if (p.id.includes("cendol") || p.name.includes("Cendol")) {
      groups[2].variants.push(p);
    }
  });

  groups.forEach((g) => {
    g.variants.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    const uniqueSizes = new Map();
    g.variants = g.variants.filter((variant) => {
      const sizeKey =
        variant.unit?.includes("1L") || variant.unit?.includes("1 Liter") || variant.name?.includes("1 Liter")
          ? "1-liter"
          : "500-ml";
      if (uniqueSizes.has(sizeKey)) return false;
      uniqueSizes.set(sizeKey, variant.id);
      return true;
    });
    if (!SELECTED_VARIANTS[g.id] && g.variants.length > 0) {
      SELECTED_VARIANTS[g.id] = g.variants[0].id;
    }
  });

  return groups.filter((g) => g.variants.length > 0);
}

function renderGroupCardHtml(g, cart) {
  const activeId = SELECTED_VARIANTS[g.id] || g.variants[0]?.id;
  const activeProd = g.variants.find((v) => v.id === activeId) || g.variants[0];
  const qty = cart[activeProd.id] || 0;
  const shortOrigin = String(g.origin || "Jakarta").replace(/MAMADEE\s*/i, "").trim() || "Jakarta";

  return `
    <div class="product-card bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col hover:border-blue-200 transition">
      ${productImage(activeProd, "w-full aspect-square")}
      <div class="p-2.5 sm:p-4 flex flex-col flex-1">
        <span class="text-[10px] sm:text-xs uppercase tracking-wider text-[--color-secondary] font-bold mb-1 truncate">${escapeHtml(g.category)}</span>
        <h3 class="font-bold text-gray-900 leading-tight mb-1 text-xs sm:text-sm sm:min-h-[2.5rem] line-clamp-2">${escapeHtml(g.name)}</h3>
        <p class="text-[11px] sm:text-xs text-gray-500 mb-1.5 line-clamp-2 flex-1">${escapeHtml(g.description)}</p>
        
        <div class="flex flex-wrap items-center gap-1.5 my-1 text-[10px] sm:text-[11px]">
          <span class="inline-flex items-center gap-1 bg-slate-50 text-slate-700 px-2 py-0.5 rounded-lg font-medium border border-slate-200/70 truncate max-w-full">
            <svg class="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span>${escapeHtml(shortOrigin)}</span>
          </span>
          ${g.expiryDetail ? `<span class="inline-flex items-center gap-1 bg-amber-50/70 text-amber-800 px-2 py-0.5 rounded-lg font-medium border border-amber-200/70">
            <svg class="w-3 h-3 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
            <span>${escapeHtml(g.expiryDetail)}</span>
          </span>` : ""}
        </div>

        <!-- Size Variant Switcher (500 ml vs 1 Liter) -->
        <div class="my-2 p-1 bg-slate-100/90 border border-slate-200/80 rounded-xl flex gap-1">
          ${g.variants
            .map((v) => {
              const isSel = v.id === activeProd.id;
              const vQty = cart[v.id] || 0;
              const sizeLabel =
                v.unit?.includes("1L") || v.unit?.includes("1 Liter") || v.name?.includes("1 Liter")
                  ? "1 Liter"
                  : "500 ml";
              return `
              <button type="button" data-action="select-variant" data-group="${escapeHtml(g.id)}" data-vid="${escapeHtml(v.id)}"
                class="flex-1 py-1.5 px-1 rounded-lg text-center transition-all ${
                  isSel
                    ? "bg-[--color-primary] text-white shadow-sm font-bold ring-1 ring-[--color-primary]"
                    : "bg-white text-gray-700 hover:text-gray-900 border border-gray-100 font-medium"
                }">
                <div class="text-[11px] leading-tight font-semibold">${sizeLabel}</div>
                <div class="text-[10px] opacity-90">${rupiah(v.price)}</div>
                ${
                  vQty > 0
                    ? `<span class="inline-block mt-0.5 text-[8px] sm:text-[9px] px-1 py-0.2 rounded-full ${
                        isSel ? "bg-white text-[--color-primary] font-bold" : "bg-blue-100 text-blue-800 font-semibold"
                      }">x${vQty} keranjang</span>`
                    : ""
                }
              </button>`;
            })
            .join("")}
        </div>

        <div class="flex items-baseline justify-between mt-auto pt-1.5 border-t border-gray-50">
          <span class="font-extrabold text-[--color-primary] text-sm sm:text-lg">${rupiah(activeProd.price)}</span>
          <span class="text-[10px] sm:text-xs text-gray-400 font-medium">/${escapeHtml(activeProd.unit)}</span>
        </div>
        <div class="mt-2" id="cart-ctrl-${activeProd.id}">
          ${cartControl(activeProd.id, qty)}
        </div>
      </div>
    </div>`;
}

function renderProductCardItemHtml(p, cart) {
  const qty = cart[p.id] || 0;
  const shortOrigin = String(p.origin || (p.brand === "Kartika Sari" ? "Bandung" : p.brand || "Lokal")).replace(/Kartika Sari\s*/i, "").trim() || "Bandung";
  return `
    <div class="product-card bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col hover:border-blue-200 transition">
      ${productImage(p, "w-full aspect-square")}
      <div class="p-2.5 sm:p-4 flex flex-col flex-1">
        <span class="text-[10px] sm:text-xs uppercase tracking-wider text-[--color-secondary] font-bold mb-1 truncate">${escapeHtml(p.category)}</span>
        <h3 class="font-bold text-gray-900 leading-tight mb-1 text-xs sm:text-sm sm:min-h-[2.5rem] line-clamp-2">${escapeHtml(p.name)}</h3>
        <p class="text-[11px] sm:text-xs text-gray-500 mb-1.5 line-clamp-2 flex-1">${escapeHtml(p.description)}</p>
        <div class="flex flex-wrap items-center gap-1.5 my-1.5 text-[10px] sm:text-[11px]">
          <span class="inline-flex items-center gap-1 bg-slate-50 text-slate-700 px-2 py-0.5 rounded-lg font-medium border border-slate-200/70 truncate max-w-full">
            <svg class="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <span>${escapeHtml(shortOrigin)}</span>
          </span>
          <span class="inline-flex items-center gap-1 bg-amber-50/70 text-amber-800 px-2 py-0.5 rounded-lg font-medium border border-amber-200/70">
            <svg class="w-3 h-3 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>
            <span>${escapeHtml(p.expiryDetail || "Tahan Lama")}</span>
          </span>
        </div>
        <div class="flex items-baseline justify-between mt-auto pt-1.5 border-t border-gray-50">
          <span class="font-extrabold text-[--color-primary] text-sm sm:text-lg">${rupiah(p.price)}</span>
          <span class="text-[10px] sm:text-xs text-gray-400 font-medium">/${escapeHtml(p.unit)}</span>
        </div>
        <div class="mt-2" id="cart-ctrl-${p.id}">
          ${cartControl(p.id, qty)}
        </div>
      </div>
    </div>`;
}

function renderProductGridHtml() {
  const cart = getCart();
  const filtered = PRODUCTS.filter((p) => {
    let matchCat = true;
    if (activeCategory === "Kartika Sari") {
      matchCat = p.brand === "Kartika Sari";
    } else if (activeCategory === "MAMADEE") {
      matchCat = p.brand === "MAMADEE";
    } else if (activeCategory === "Produk UMKM" || activeCategory === "UMKM") {
      matchCat = p.category === "Produk UMKM" || (p.brand !== "Kartika Sari" && p.brand !== "MAMADEE");
    } else if (activeCategory !== "Semua") {
      matchCat = p.category === activeCategory || p.brand === activeCategory;
    }
    const matchSearch =
      (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.brand || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    return `
      <div class="text-center py-16 px-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div class="w-16 h-16 bg-blue-50 text-[--color-primary] rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
        <p class="font-bold text-gray-800 text-base">Produk tidak ditemukan</p>
        <p class="text-xs text-gray-400 mt-1">Coba kata kunci lain atau pilih tab produk lainnya.</p>
      </div>`;
  }

  // Tampilkan dikelompokkan menjadi 3 seksi: Kartika Sari, UMKM MAMADEE, dan Kuliner & Sambal UMKM
  if (activeCategory === "Semua" && !searchQuery) {
    const kartikaProds = filtered.filter((p) => p.brand === "Kartika Sari");
    const mamadeeGroups = getMamadeeGroups(filtered.filter((p) => p.brand === "MAMADEE"));
    const umkmProds = filtered.filter((p) => p.brand !== "Kartika Sari" && p.brand !== "MAMADEE");

    const kartikaHtml =
      kartikaProds.length > 0
        ? `
      <div class="mb-12">
        <div class="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-200">
          <span class="w-3.5 h-3.5 rounded-full bg-[--color-primary] shrink-0"></span>
          <div>
            <h3 class="font-bold text-base sm:text-xl text-gray-900 leading-tight">Oleh-Oleh Kartika Sari Bandung</h3>
            <p class="text-xs text-gray-500 hidden sm:block">Koleksi bolu gulung, lapis legit, pisang bolen & brownies panggang resmi khas Bandung</p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
          ${kartikaProds.map((p) => renderProductCardItemHtml(p, cart)).join("")}
        </div>
      </div>
    `
        : "";

    const mamadeeHtml =
      mamadeeGroups.length > 0
        ? `
      <div class="mb-12">
        <div class="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-200">
          <span class="w-3.5 h-3.5 rounded-full bg-emerald-600 shrink-0"></span>
          <div>
            <h3 class="font-bold text-base sm:text-xl text-gray-900 leading-tight">Kopi & Minuman UMKM (MAMADEE)</h3>
            <p class="text-xs text-gray-500 hidden sm:block">Pilihan ukuran 500 ml & 1 Liter • Sudah termasuk Cooler Bag & Ice Gel</p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
          ${mamadeeGroups.map((g) => renderGroupCardHtml(g, cart)).join("")}
        </div>
      </div>
    `
        : "";

    const umkmHtml =
      umkmProds.length > 0
        ? `
      <div class="mb-12">
        <div class="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-200">
          <span class="w-3.5 h-3.5 rounded-full bg-orange-500 shrink-0"></span>
          <div>
            <h3 class="font-bold text-base sm:text-xl text-gray-900 leading-tight">Kuliner & Sambal UMKM</h3>
            <p class="text-xs text-gray-500 hidden sm:block">Produk olahan sambal & bumbu pecel istimewa khas UMKM lokal</p>
          </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
          ${umkmProds.map((p) => renderProductCardItemHtml(p, cart)).join("")}
        </div>
      </div>
    `
        : "";

    return `${kartikaHtml}${mamadeeHtml}${umkmHtml}`;
  }

  // Jika memilih kategori MAMADEE
  if (activeCategory === "MAMADEE" && !searchQuery) {
    const mamadeeGroups = getMamadeeGroups(filtered);
    return `
      <div class="mb-4 pb-3 border-b border-gray-200">
        <h3 class="font-bold text-base sm:text-lg text-gray-900">Koleksi Kopi & Minuman UMKM (MAMADEE)</h3>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
        ${mamadeeGroups.map((g) => renderGroupCardHtml(g, cart)).join("")}
      </div>`;
  }

  // Jika memilih kategori Kartika Sari / UMKM atau sedang mencari kata kunci
  const titleMap = {
    "Kartika Sari": "Koleksi Oleh-Oleh Kartika Sari Bandung",
    MAMADEE: "Koleksi Kopi & Minuman UMKM (MAMADEE)",
    "Produk UMKM": "Koleksi Kuliner & Sambal UMKM",
    UMKM: "Koleksi Kuliner & Sambal UMKM",
  };
  const sectionTitle = searchQuery
    ? `Hasil Pencarian untuk "${searchQuery}"`
    : titleMap[activeCategory] || activeCategory;

  const cards = filtered.map((p) => renderProductCardItemHtml(p, cart)).join("");
  return `
    <div class="mb-4 pb-3 border-b border-gray-200">
      <h3 class="font-bold text-base sm:text-lg text-gray-900">${escapeHtml(sectionTitle)}</h3>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">${cards}</div>`;
}

function cartControl(productId, qty) {
  if (qty === 0) {
    return `<button data-action="add" data-id="${productId}"
      class="w-full bg-[--color-primary] hover:bg-[--color-primary-dark] text-white text-sm font-semibold py-2 rounded-xl active:scale-95 transition flex items-center justify-center gap-1.5 shadow-sm">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
      <span>Tambah</span>
    </button>`;
  }
  return `
    <div class="flex items-center justify-between bg-blue-50/80 rounded-xl border border-[--color-primary]/30 px-1 py-0.5">
      <button data-action="dec" data-id="${productId}" class="w-8 h-8 text-[--color-primary] font-bold text-lg flex items-center justify-center hover:bg-white rounded-lg transition">−</button>
      <span class="font-bold text-sm text-[--color-primary]">${qty}</span>
      <button data-action="inc" data-id="${productId}" class="w-8 h-8 text-[--color-primary] font-bold text-lg flex items-center justify-center hover:bg-white rounded-lg transition">+</button>
    </div>`;
}

// ===== Keranjang =====
function renderKeranjang() {
  const items = cartDetailed();
  if (items.length === 0) {
    setView(`
      <div class="flex flex-col items-center justify-center text-center py-24 px-6">
        <div class="w-20 h-20 bg-blue-50 text-[--color-primary] rounded-full flex items-center justify-center mb-4">
          <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
          </svg>
        </div>
        <h2 class="font-semibold text-lg text-gray-800 mb-1">Keranjang masih kosong</h2>
        <p class="text-sm text-gray-400 mb-6">Yuk pilih oleh-oleh khas Jakarta favoritmu!</p>
        <button data-action="go-katalog" class="bg-[--color-primary] text-white px-6 py-2.5 rounded-full font-medium shadow-md hover:bg-[--color-primary-dark] transition">Lihat Katalog</button>
      </div>
    `);
    return;
  }

  const rows = items
    .map(
      (item) => `
    <div class="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
      ${productImage(item.product, "w-14 h-14 rounded-lg")}
      <div class="flex-1 min-w-0">
        <h4 class="font-semibold text-sm text-gray-900 truncate">${escapeHtml(item.product.name)}</h4>
        <p class="text-xs text-gray-400">${rupiah(item.product.price)} / ${escapeHtml(item.product.unit)}</p>
        <div class="flex items-center gap-2 mt-1.5">
          <button data-action="dec" data-id="${item.product.id}" class="w-7 h-7 rounded-full border border-gray-200 text-[--color-primary] font-bold flex items-center justify-center hover:bg-gray-50">−</button>
          <span class="text-sm font-semibold w-5 text-center">${item.qty}</span>
          <button data-action="inc" data-id="${item.product.id}" class="w-7 h-7 rounded-full border border-gray-200 text-[--color-primary] font-bold flex items-center justify-center hover:bg-gray-50">+</button>
        </div>
      </div>
      <div class="text-right shrink-0">
        <p class="font-bold text-sm text-[--color-primary]">${rupiah(item.subtotal)}</p>
        <button data-action="remove" data-id="${item.product.id}" class="text-xs text-red-500 hover:text-red-700 mt-2 flex items-center gap-1 ml-auto">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          <span>Hapus</span>
        </button>
      </div>
    </div>`
    )
    .join("");

  setView(`
    <div class="px-4 sm:px-6 py-4 max-w-3xl mx-auto">
      <h2 class="font-semibold text-lg text-gray-800 mb-3 flex items-center gap-2">
        <svg class="w-5 h-5 text-[--color-primary]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
        <span>Keranjang Belanja</span>
      </h2>
      <div class="space-y-3 mb-4">${rows}</div>
      <div class="bg-white rounded-xl p-4 border border-gray-100 mb-24 shadow-sm">
        <div class="flex justify-between text-sm text-gray-500 mb-1">
          <span>Total item</span><span>${cartCount()} pcs</span>
        </div>
        <div class="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2 mt-2">
          <span>Total Bayar</span><span class="text-[--color-primary]">${rupiah(cartTotal())}</span>
        </div>
      </div>
    </div>
    <div class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3 flex gap-2 z-30 shadow-lg">
      <div class="max-w-3xl mx-auto flex gap-2 w-full">
        <button data-action="go-katalog" class="flex-1 border border-[--color-primary] text-[--color-primary] rounded-xl py-3 text-sm font-semibold hover:bg-blue-50 transition">+ Tambah Lagi</button>
        <button data-action="go-checkout" class="flex-1 bg-[--color-primary] hover:bg-[--color-primary-dark] text-white rounded-xl py-3 text-sm font-semibold shadow-md transition flex items-center justify-center gap-1.5">
          <span>Checkout</span>
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </button>
      </div>
    </div>
  `);
}

// ===== Checkout =====
function renderCheckout() {
  const items = cartDetailed();
  if (items.length === 0) {
    navigate("#/katalog");
    return;
  }

  const summary = items
    .map(
      (i) => `<div class="flex justify-between text-sm py-1">
        <span class="text-gray-600">${escapeHtml(i.product.name)} x${i.qty}</span>
        <span class="text-gray-800 font-medium">${rupiah(i.subtotal)}</span>
      </div>`
    )
    .join("");

  const methods = ["Ambil di Booth", "Antar ke Kamar Hotel", "Antar ke Lokasi RTA"];
  const methodOptions = methods
    .map(
      (m, idx) => `
    <label class="flex items-center gap-2 border border-gray-200 rounded-xl p-3 text-sm cursor-pointer has-[:checked]:border-[--color-primary] has-[:checked]:bg-blue-50/50 transition">
      <input type="radio" name="method" value="${escapeHtml(m)}" ${idx === 0 ? "checked" : ""} class="accent-[--color-primary]" />
      <span>${escapeHtml(m)}</span>
    </label>`
    )
    .join("");

  const bankOptionsList = (CONFIG.banks && CONFIG.banks.length > 0)
    ? CONFIG.banks
    : [
        { key: "BCA", name: "BCA" },
        { key: "BSI", name: "BSI" },
        { key: "Mandiri", name: "Mandiri" },
      ];

  const bankRadioOptions = bankOptionsList
    .map(
      (b, idx) => `
    <label class="flex items-center justify-between border border-gray-200 rounded-xl p-3 text-sm cursor-pointer has-[:checked]:border-[--color-primary] has-[:checked]:bg-blue-50/50 transition">
      <div class="flex items-center gap-2">
        <input type="radio" name="targetBank" value="${escapeHtml(b.key)}" ${idx === 0 ? "checked" : ""} class="accent-[--color-primary]" />
        <span class="font-semibold text-gray-800">${escapeHtml(b.name)}</span>
      </div>
      <span class="text-xs text-gray-400 font-mono">${escapeHtml(b.accountNumber || "")}</span>
    </label>`
    )
    .join("");

  setView(`
    <div class="px-4 sm:px-6 py-4 pb-28 max-w-2xl mx-auto">
      <h2 class="font-semibold text-lg text-gray-800 mb-3 flex items-center gap-2">
        <svg class="w-5 h-5 text-[--color-primary]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <span>Checkout Pesanan</span>
      </h2>

      <div class="bg-white rounded-xl p-4 border border-gray-100 mb-4 shadow-sm">
        <h3 class="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-2">Ringkasan Pesanan</h3>
        ${summary}
        <div class="border-t border-dashed border-gray-200 mt-2 pt-2 flex justify-between font-bold text-base">
          <span>Total</span><span class="text-[--color-primary]">${rupiah(cartTotal())}</span>
        </div>
      </div>

      <form id="checkout-form" class="bg-white rounded-xl p-4 border border-gray-100 space-y-3 shadow-sm">
        <h3 class="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-1">Data Pemesan</h3>
        <div>
          <label class="text-xs font-medium text-gray-600">Nama Lengkap *</label>
          <input required name="name" type="text" placeholder="Nama sesuai identitas"
            class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-1 focus:border-[--color-primary]" />
        </div>
        <div>
          <label class="text-xs font-medium text-gray-600">Nomor WhatsApp (Aktif) *</label>
          <input required name="wa" type="tel" placeholder="08xxxxxxxxxx"
            class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-1 focus:border-[--color-primary]" />
        </div>
        <div>
          <label class="text-xs font-medium text-gray-600">Instansi / Asal Daerah *</label>
          <input required name="instansi" type="text" placeholder="Contoh: Poltekkes Jakarta III"
            class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-1 focus:border-[--color-primary]" />
        </div>
        <div>
          <label class="text-xs font-medium text-gray-600 mb-1.5 block">Pilih Bank Tujuan Transfer *</label>
          <div class="space-y-2">${bankRadioOptions}</div>
        </div>
        <div>
          <label class="text-xs font-medium text-gray-600 mb-1.5 block">Metode Pengambilan / Pengiriman *</label>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">${methodOptions}</div>
        </div>
        <div id="detail-wrap" class="hidden">
          <label class="text-xs font-medium text-gray-600">Detail Lokasi (Nomor kamar / titik lokasi) *</label>
          <input name="detail" type="text" placeholder="Contoh: Kamar 502, Hotel Aryaduta"
            class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-1 focus:border-[--color-primary]" />
        </div>
        <p id="checkout-error" class="text-xs text-red-500 hidden"></p>
        <button type="submit" class="hidden"></button>
      </form>
    </div>
    <div class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3 z-30 shadow-lg">
      <div class="max-w-2xl mx-auto">
        <button id="submit-order" class="w-full bg-[--color-primary] hover:bg-[--color-primary-dark] text-white rounded-xl py-3 text-sm font-semibold shadow-md transition">
          Buat Pesanan Sekarang
        </button>
      </div>
    </div>
  `);

  const form = document.getElementById("checkout-form");
  const detailInput = form.querySelector('input[name="detail"]');
  const toggleDetail = () => {
    const method = form.method.value;
    const isRequired = method !== "Ambil di Booth";
    document.getElementById("detail-wrap").classList.toggle("hidden", !isRequired);
    if (isRequired) {
      detailInput.setAttribute("required", "required");
    } else {
      detailInput.removeAttribute("required");
    }
  };
  form.querySelectorAll('input[name="method"]').forEach((el) => el.addEventListener("change", toggleDetail));
  toggleDetail();

  const handleOrderSubmit = async () => {
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const method = fd.get("method");
    const detail = fd.get("detail") ? String(fd.get("detail")).trim() : "";
    const targetBank = fd.get("targetBank") ? String(fd.get("targetBank")).trim() : "BCA";

    if (method !== "Ambil di Booth" && !detail) {
      const errEl = document.getElementById("checkout-error");
      errEl.textContent = "Mohon isi detail lokasi pengiriman (nomor kamar / titik lokasi).";
      errEl.classList.remove("hidden");
      return;
    }

    const payload = {
      customer: {
        name: String(fd.get("name")).trim(),
        wa: String(fd.get("wa")).trim(),
        instansi: String(fd.get("instansi")).trim(),
        method,
        detail,
        targetBank,
      },
      items: items.map((i) => ({ productId: i.product.id, qty: i.qty })),
    };

    const btn = document.getElementById("submit-order");
    btn.disabled = true;
    btn.textContent = "Memproses...";
    try {
      const order = await Api.post("/api/orders", payload);
      saveMyOrder(order.id);
      clearCart();
      navigate(`#/konfirmasi/${order.id}`);
    } catch (err) {
      const errEl = document.getElementById("checkout-error");
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Buat Pesanan";
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleOrderSubmit();
  });

  document.getElementById("submit-order").addEventListener("click", () => {
    handleOrderSubmit();
  });
}

// ===== Modal Success Pop-up with Animated Checkmark =====
function showSuccessModal(orderId) {
  const existing = document.getElementById("success-modal");
  if (existing) existing.remove();

  const modalHtml = `
    <div id="success-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-3xl max-w-sm w-full p-6 sm:p-8 text-center shadow-2xl border border-gray-100 relative anim-modal-in flex flex-col items-center">
        <div class="w-20 h-20 mb-4 relative flex items-center justify-center anim-checkmark-pop">
          <svg class="w-20 h-20" viewBox="0 0 52 52">
            <circle class="checkmark-circle" cx="26" cy="26" r="23" />
            <path class="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>
        </div>
        <h3 class="font-bold text-xl text-gray-900 mb-1">Bukti Transfer Berhasil Terkirim</h3>
        <p class="text-xs text-gray-500 mb-5 leading-relaxed">
          Bukti pembayaran pesanan <b class="text-[--color-primary] font-mono font-semibold">#${escapeHtml(orderId)}</b> berhasil diunggah. Tim admin akan segera memverifikasi pesanan Anda.
        </p>
        <div class="space-y-2.5 w-full">
          <button onclick="document.getElementById('success-modal').remove(); navigate('#/tracking/${encodeURIComponent(orderId)}');"
            class="w-full bg-[--color-primary] hover:bg-[--color-primary-dark] text-white rounded-xl py-3 text-xs font-semibold shadow-md transition flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
            <span>Lacak Status Pesanan Saya</span>
          </button>
          <button onclick="document.getElementById('success-modal').remove(); navigate('#/katalog');"
            class="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl py-2.5 text-xs font-semibold transition flex items-center justify-center gap-1.5">
            <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
            <span>Kembali ke Beranda Katalog</span>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHtml);
}

// ===== Konfirmasi =====
async function renderKonfirmasi(orderId) {
  setView(`<div class="flex justify-center py-24"><div class="spinner"></div></div>`);
  let order;
  try {
    const data = await Api.get(`/api/orders/${encodeURIComponent(orderId)}`);
    order = data.order;
    saveMyOrder(order.id);
  } catch (err) {
    setView(`<div class="text-center py-24 text-gray-400">Pesanan tidak ditemukan.</div>`);
    return;
  }

  const itemsList = order.items
    .map(
      (i) => `<div class="flex justify-between text-sm py-1">
      <span class="text-gray-600">${escapeHtml(i.name)} x${i.qty}</span>
      <span class="text-gray-800 font-medium">${rupiah(i.subtotal)}</span>
    </div>`
    )
    .join("");

  const selectedBankKey = (order.customer && order.customer.targetBank) || "BCA";
  const matchedBank = (CONFIG.banks || []).find((b) => b.key === selectedBankKey) || CONFIG.bank || {};
  const targetBankInfo = `${matchedBank.name || selectedBankKey} (${matchedBank.accountNumber || "-"} a.n. ${matchedBank.accountName || "-"})`;
  const itemsTextList = order.items.map((i) => `• ${i.name} x${i.qty} = ${rupiah(i.subtotal)}`).join("\n");

  const waMessage = `Halo Admin APTIRMIKI, saya ingin konfirmasi bukti transfer pembayaran pesanan saya:

*DETAIL PESANAN*
• ID Pesanan: *#${order.id}*
• Nama Pemesan: *${order.customer.name}*
• No. WhatsApp: *${order.customer.wa}*
• Instansi: *${order.customer.instansi}*
• Metode Pengambilan: *${order.customer.method}${order.customer.detail ? ` (${order.customer.detail})` : ""}*

*RINCIAN BARANG*
${itemsTextList}

*TOTAL PEMBAYARAN: ${rupiah(order.total)}*
*TRANSFER KE: ${targetBankInfo}*

(Saya melampirkan foto atau screenshot bukti transfer pembayaran pada pesan ini.)

Mohon segera diverifikasi dan diproses ya Admin. Terima kasih!`;

  const waLink = formatWaLink(CONFIG.adminWaNumber, waMessage);

  const qrisBlock = CONFIG.qrisImageUrl
    ? `<img src="${CONFIG.qrisImageUrl}" alt="QRIS" class="w-44 h-44 mx-auto rounded-lg border border-gray-100 mt-2 shadow-sm" />`
    : "";

  const proofBlock = order.proof
    ? `<div class="mt-3 space-y-2">
        <div class="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3 border border-emerald-200">
          <svg class="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <div>
            <p class="font-bold text-xs">Bukti Transfer Berhasil Diunggah!</p>
            <p class="text-[11px] text-emerald-800">Menunggu verifikasi admin panitia.</p>
          </div>
        </div>
        <img src="${getProofSrc(order.proof)}" alt="Bukti Transfer" class="w-36 h-36 object-cover rounded-xl border border-gray-200 mx-auto shadow-sm" />
      </div>`
    : "";

  setView(`
    <div class="px-4 sm:px-6 py-4 pb-32 max-w-2xl mx-auto">
      <div class="text-center mb-6">
        <div class="w-16 h-16 bg-blue-50 text-[--color-primary] rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 class="font-bold text-xl text-gray-900">Pesanan Berhasil Dibuat!</h2>
        <p class="text-2xl font-black text-[--color-primary] mt-1 tracking-wide">#${escapeHtml(order.id)}</p>
        <p class="text-xs text-gray-400 mt-1">Simpan ID ini untuk melacak status pesananmu.</p>
      </div>

      <div class="bg-white rounded-2xl p-4 border border-gray-100 mb-4 shadow-sm">
        <h3 class="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-2">Detail Pesanan</h3>
        ${itemsList}
        <div class="border-t border-dashed border-gray-200 mt-2 pt-2 flex justify-between font-bold">
          <span>Total Bayar</span><span class="text-[--color-primary]">${rupiah(order.total)}</span>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-4 border border-gray-100 mb-4 shadow-sm">
        <h3 class="text-xs uppercase tracking-wide font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
          <svg class="w-4 h-4 text-[--color-primary]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          <span>Info Rekening Pembayaran (Transfer Ke ${escapeHtml(selectedBankKey)})</span>
        </h3>
        <div class="text-sm text-gray-700 space-y-2">
          <p class="text-xs text-gray-500"><span class="text-gray-400">Bank Tujuan:</span> <b class="text-gray-900">${escapeHtml(matchedBank.name || selectedBankKey)}</b></p>
          <div class="flex items-center justify-between bg-blue-50/60 p-3 rounded-xl border border-blue-100">
            <div>
              <p class="text-[11px] text-gray-500">Nomor Rekening</p>
              <p class="font-mono font-black text-gray-900 text-base sm:text-lg">${escapeHtml(matchedBank.accountNumber || "-")}</p>
            </div>
            <button data-action="copy-bank" onclick="copyText('${escapeHtml(matchedBank.accountNumber || "")}', 'Nomor Rekening ${escapeHtml(selectedBankKey)}')" class="bg-white border border-gray-200 hover:border-[--color-primary] text-xs px-3.5 py-2 rounded-xl font-bold shadow-sm transition flex items-center gap-1 text-[--color-primary] active:scale-95">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              <span>Salin</span>
            </button>
          </div>
          <p class="text-xs text-gray-500"><span class="text-gray-400">Atas Nama:</span> <b>${escapeHtml(matchedBank.accountName || "-")}</b></p>
        </div>
        ${qrisBlock}
      </div>

      <!-- Upload Bukti Transfer (WAJIB) -->
      <div class="bg-white rounded-2xl p-4 border border-blue-100 mb-4 shadow-sm ring-1 ring-blue-50">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-xs uppercase tracking-wide font-bold text-gray-800 flex items-center gap-1.5">
            <svg class="w-4 h-4 text-[--color-primary]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            <span>Unggah Bukti Transfer</span>
          </h3>
          <span class="bg-red-50 text-red-600 border border-red-200 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">WAJIB</span>
        </div>

        <p class="text-xs text-gray-500 mb-3">Mohon unggah foto / screenshot bukti transfer Anda agar pesanan dapat segera diproses panitia.</p>

        <input id="proof-input" type="file" accept="image/*" class="text-xs w-full border border-gray-200 rounded-xl p-2.5 bg-gray-50 cursor-pointer" />
        <div id="proof-preview-wrap" class="hidden mt-3 text-center">
          <p class="text-xs text-gray-400 mb-1 font-medium">Pratinjau Foto Bukti:</p>
          <img id="proof-preview-img" src="" class="w-36 h-36 object-cover rounded-xl border border-gray-200 mx-auto shadow-sm" />
        </div>
        <button id="proof-submit" class="w-full mt-3 bg-[--color-primary] hover:bg-[--color-primary-dark] text-white rounded-xl py-3 text-xs font-bold shadow-md shadow-blue-600/20 transition active:scale-98 flex items-center justify-center gap-2">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          <span>Kirim Bukti Pembayaran Sekarang</span>
        </button>
        <p id="proof-error" class="text-xs text-red-500 hidden mt-2 text-center font-medium"></p>
        ${proofBlock}

        <!-- Catatan Bantuan WhatsApp -->
        <div class="mt-4 p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
          <svg class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div class="space-y-1">
            <p class="font-bold text-amber-900">Kendala Unggah Foto di Website?</p>
            <p class="text-amber-800 text-[11px] leading-relaxed">
              Jika Anda tidak dapat mengunggah bukti di formulir atas, silakan klik tombol <b>Konfirmasi via WhatsApp Admin</b> di bawah untuk mengirimkan format pesanan sekaligus melampirkan foto bukti pembayaran Anda.
            </p>
          </div>
        </div>
      </div>

      <a href="${waLink}" target="_blank" rel="noopener"
        class="flex items-center justify-center gap-2 text-center w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3.5 text-xs sm:text-sm font-bold mb-3 shadow-md shadow-emerald-600/20 transition active:scale-98">
        <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-0.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
        <span>Konfirmasi & Kirim Bukti via WhatsApp Admin</span>
      </a>
      <button data-action="go-tracking-order" data-id="${escapeHtml(order.id)}" class="w-full border border-gray-200 text-gray-700 hover:border-blue-300 rounded-xl py-3 text-xs sm:text-sm font-semibold mb-2 transition flex items-center justify-center gap-1.5 bg-white">
        <svg class="w-4 h-4 text-[--color-primary]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        <span>Lihat di Riwayat & Lacak Status</span>
      </button>
      <button data-action="go-katalog" class="w-full text-[--color-primary] py-2 text-xs sm:text-sm font-semibold hover:underline">
        Kembali ke Katalog
      </button>
    </div>
  `);

  const fileInput = document.getElementById("proof-input");
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const wrap = document.getElementById("proof-preview-wrap");
      const img = document.getElementById("proof-preview-img");
      if (file && file.type.startsWith("image/")) {
        img.src = URL.createObjectURL(file);
        wrap.classList.remove("hidden");
      } else {
        wrap.classList.add("hidden");
      }
    });
  }

  document.getElementById("proof-submit").addEventListener("click", async () => {
    const errEl = document.getElementById("proof-error");
    errEl.classList.add("hidden");
    if (!fileInput.files[0]) {
      errEl.textContent = "Wajib memilih file foto bukti transfer terlebih dahulu.";
      errEl.classList.remove("hidden");
      return;
    }
    const btn = document.getElementById("proof-submit");
    btn.disabled = true;
    btn.textContent = "Menyiapkan Foto...";
    try {
      const proofFile = await prepareProofFile(fileInput.files[0]);
      const fd = new FormData();
      fd.append("proof", proofFile);
      btn.textContent = "Mengunggah Bukti...";
      await Api.postForm(`/api/orders/${encodeURIComponent(order.id)}/proof`, fd);
      showSuccessModal(order.id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Kirim Bukti Pembayaran Sekarang";
    }
  });
}

// ===== Real-time Auto-Sync for Tracking & Orders =====
let activeLiveSyncTimer = null;
let lastKnownStatusMap = {};

function stopLiveSync() {
  if (activeLiveSyncTimer) {
    clearInterval(activeLiveSyncTimer);
    activeLiveSyncTimer = null;
  }
}

function startLiveSync(syncCallback, intervalMs = 4000) {
  stopLiveSync();
  activeLiveSyncTimer = setInterval(async () => {
    try {
      await syncCallback(true);
    } catch (e) {}
  }, intervalMs);
}

// ===== Riwayat & Status Pesanan (Tracking & History) =====
function renderTracking(prefillQuery, defaultTab = "tracking") {
  const myOrders = getMyOrders();
  const isHistoryTab = defaultTab === "riwayat";

  const recentChips = myOrders.length
    ? myOrders
        .map(
          (id) => `<button data-action="quick-track" data-id="${escapeHtml(id)}" class="text-xs bg-white border border-gray-200 text-[--color-primary] px-3 py-1 rounded-full font-mono shadow-sm hover:border-[--color-primary] transition font-semibold">#${escapeHtml(id)}</button>`
        )
        .join("")
    : "";

  const recentBlock = recentChips
    ? `<div class="mb-4">
        <p class="text-xs text-gray-400 mb-1.5 font-medium">Pesanan Terakhir Anda di Perangkat Ini:</p>
        <div class="flex flex-wrap gap-1.5">${recentChips}</div>
      </div>`
    : "";

  setView(`
    <div class="px-4 sm:px-6 py-4 max-w-2xl mx-auto pb-32">
      
      <!-- Sub Nav Tabs (Tracking vs History) -->
      <div class="flex border-b border-gray-200 mb-5 gap-4">
        <button id="user-tab-tracking" data-action="go-tracking"
          class="pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            !isHistoryTab
              ? "text-[--color-primary] border-[--color-primary]"
              : "text-gray-400 border-transparent hover:text-gray-600"
          }">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <span>Lacak Status Pesanan</span>
        </button>
        <button id="user-tab-riwayat" data-action="go-riwayat"
          class="pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            isHistoryTab
              ? "text-[--color-primary] border-[--color-primary]"
              : "text-gray-400 border-transparent hover:text-gray-600"
          }">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          <span>Riwayat Pesanan Saya</span>
          <span class="bg-blue-50 text-[--color-primary] text-xs px-2 py-0.5 rounded-full font-mono font-semibold">${myOrders.length}</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="user-tab-content">
        ${
          isHistoryTab
            ? `<div id="history-content"><div class="flex justify-center py-10"><div class="spinner"></div></div></div>`
            : `
              <p class="text-xs text-gray-500 mb-3">Masukkan ID Pesanan (contoh: APT-8821) atau Nomor WhatsApp yang digunakan saat memesan untuk melacak status pesanan secara real-time.</p>
              
              <div class="flex gap-2 mb-3">
                <input id="track-input" type="text" placeholder="APT-8821 atau 08xxxxxxxxxx" value="${escapeHtml(prefillQuery || myOrders[0] || "")}"
                  class="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:border-[--color-primary]" />
                <button id="track-btn" class="bg-[--color-primary] hover:bg-[--color-primary-dark] text-white px-5 rounded-xl text-sm font-bold shadow-sm transition active:scale-95">Lacak</button>
              </div>

              ${recentBlock}

              <div id="track-result"></div>
            `
        }
      </div>
    </div>
  `);

  const manualBtn = document.getElementById("manual-sync-btn");

  if (isHistoryTab) {
    loadMyHistoryOrders();
    startLiveSync(() => loadMyHistoryOrders(true), 4000);
    if (manualBtn) manualBtn.onclick = () => loadMyHistoryOrders(false);
  } else {
    const runSearch = async (isSilent = false) => {
      const q = document.getElementById("track-input")?.value.trim();
      const resultEl = document.getElementById("track-result");
      if (!q || !resultEl) return;
      if (!isSilent) {
        resultEl.innerHTML = `<div class="flex justify-center py-10"><div class="spinner"></div></div>`;
      }
      try {
        const data = await Api.get(`/api/orders/track?query=${encodeURIComponent(q)}`);
        
        // Detect if any status changed to notify user
        let hasChange = false;
        data.orders.forEach((o) => {
          const prevKey = `${o.id}_${o.status}_${Boolean(o.proof)}`;
          if (lastKnownStatusMap[o.id] && lastKnownStatusMap[o.id] !== prevKey) {
            hasChange = true;
            const flowItem = data.statusFlow.find((s) => s.key === o.status);
            showToast(`🔔 Status pesanan #${o.id} diperbarui: ${flowItem ? flowItem.label : o.status}`);
          }
          lastKnownStatusMap[o.id] = prevKey;
        });

        resultEl.innerHTML = `
          <p class="text-xs text-gray-400 mb-2 font-medium">${data.orders.length} pesanan ditemukan</p>
          ${data.orders.map((o) => renderTrackCard(o, data.statusFlow)).join("")}
        `;
        attachTrackCardHandlers(resultEl, () => runSearch(false));
      } catch (err) {
        if (!isSilent) {
          resultEl.innerHTML = `
            <div class="text-center text-gray-400 py-12 px-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <svg class="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <p class="text-sm font-medium text-gray-600">${escapeHtml(err.message)}</p>
            </div>`;
        }
      }
    };

    const trackBtn = document.getElementById("track-btn");
    const trackInput = document.getElementById("track-input");
    if (trackBtn) trackBtn.addEventListener("click", () => runSearch(false));
    if (trackInput) {
      trackInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") runSearch(false);
      });
    }

    if (manualBtn) manualBtn.onclick = () => runSearch(false);

    const queryToRun = prefillQuery || myOrders[0];
    if (queryToRun) {
      runSearch(false);
      startLiveSync(() => runSearch(true), 4000);
    }
  }
}

async function loadMyHistoryOrders(isSilent = false) {
  const historyEl = document.getElementById("history-content");
  if (!historyEl) return;

  const myOrderIds = getMyOrders();
  if (myOrderIds.length === 0) {
    historyEl.innerHTML = `
      <div class="text-center py-16 px-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div class="w-16 h-16 bg-blue-50 text-[--color-primary] rounded-full flex items-center justify-center mx-auto mb-3">
          <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
        </div>
        <h3 class="font-bold text-gray-800 text-base mb-1">Belum Ada Riwayat Pesanan</h3>
        <p class="text-xs text-gray-400 mb-5">Anda belum pernah membuat pesanan di perangkat ini.</p>
        <button data-action="go-katalog" class="bg-[--color-primary] text-white px-5 py-2 rounded-full text-xs font-semibold shadow-sm hover:bg-[--color-primary-dark] transition">Belanja Sekarang</button>
      </div>`;
    return;
  }

  try {
    const promises = myOrderIds.map((id) =>
      Api.get(`/api/orders/track?query=${encodeURIComponent(id)}`).catch(() => null)
    );
    const results = await Promise.all(promises);
    const allFetchedOrders = [];
    let statusFlow = [];
    results.forEach((res) => {
      if (res && res.orders) {
        allFetchedOrders.push(...res.orders);
        if (res.statusFlow) statusFlow = res.statusFlow;
      }
    });

    if (allFetchedOrders.length === 0) {
      if (!isSilent) {
        historyEl.innerHTML = `
          <div class="text-center py-12 px-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <p class="text-sm text-gray-500 font-medium">Tidak ada riwayat pesanan aktif yang dapat dimuat.</p>
          </div>`;
      }
      return;
    }

    // Check if status changed
    allFetchedOrders.forEach((o) => {
      const prevKey = `${o.id}_${o.status}_${Boolean(o.proof)}`;
      if (lastKnownStatusMap[o.id] && lastKnownStatusMap[o.id] !== prevKey) {
        const flowItem = statusFlow.find((s) => s.key === o.status);
        showToast(`🔔 Status pesanan #${o.id} diperbarui: ${flowItem ? flowItem.label : o.status}`);
      }
      lastKnownStatusMap[o.id] = prevKey;
    });

    historyEl.innerHTML = `
      <div class="space-y-3">
        <p class="text-xs text-gray-400 font-medium">Menampilkan ${allFetchedOrders.length} riwayat pesanan Anda:</p>
        ${allFetchedOrders.map((o) => renderTrackCard(o, statusFlow)).join("")}
      </div>`;
    attachTrackCardHandlers(historyEl, () => loadMyHistoryOrders(false));
  } catch (err) {
    if (!isSilent) {
      historyEl.innerHTML = `<div class="text-center text-gray-400 py-10 text-xs">${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderTrackCard(order, statusFlow) {
  const currentIdx = statusFlow.findIndex((s) => s.key === order.status);
  const steps = statusFlow
    .map((s, idx) => {
      const done = idx <= currentIdx;
      return `
      <div class="timeline-step flex-1 flex flex-col items-center text-center ${done ? "done" : ""}">
        <div class="timeline-dot w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
          done ? "bg-[--color-primary] text-white shadow-sm" : "bg-gray-100 text-gray-400"
        }">${idx + 1}</div>
        <span class="text-[10px] mt-1.5 w-16 leading-tight ${done ? "text-gray-900 font-semibold" : "text-gray-400"}">${escapeHtml(s.label)}</span>
      </div>`;
    })
    .join("");

  const itemsList = order.items
    .map((i) => `<div class="flex justify-between text-xs py-0.5"><span class="text-gray-600">${escapeHtml(i.name)} x${i.qty}</span><span class="font-medium">${rupiah(i.subtotal)}</span></div>`)
    .join("");

  const selectedBankKey = (order.customer && order.customer.targetBank) || "BCA";
  const matchedBank = (CONFIG.banks || []).find((b) => b.key === selectedBankKey) || CONFIG.bank || {};
  const targetBankInfo = `${matchedBank.name || selectedBankKey} (${matchedBank.accountNumber || "-"} a.n. ${matchedBank.accountName || "-"})`;
  const itemsTextList = order.items.map((i) => `• ${i.name} x${i.qty} = ${rupiah(i.subtotal)}`).join("\n");

  const waMessage = order.status === "menunggu_pembayaran"
    ? `Halo Admin APTIRMIKI, saya ingin konfirmasi bukti transfer pembayaran pesanan saya:

*DETAIL PESANAN*
• ID Pesanan: *#${order.id}*
• Nama Pemesan: *${order.customer.name}*
• No. WhatsApp: *${order.customer.wa}*
• Instansi: *${order.customer.instansi}*
• Metode Pengambilan: *${order.customer.method}${order.customer.detail ? ` (${order.customer.detail})` : ""}*

*RINCIAN BARANG*
${itemsTextList}

*TOTAL PEMBAYARAN: ${rupiah(order.total)}*
*TRANSFER KE: ${targetBankInfo}*

(Saya melampirkan foto atau screenshot bukti transfer pembayaran pada pesan ini.)

Mohon segera diverifikasi dan diproses ya Admin. Terima kasih!`
    : `Halo Admin APTIRMIKI, saya ingin menanyakan status pesanan saya:
• ID Pesanan: *#${order.id}*
• Nama Pemesan: *${order.customer.name}*
• Status Saat Ini: *${statusFlow[currentIdx]?.label || order.status}*

Terima kasih!`;

  const waLink = formatWaLink(CONFIG.adminWaNumber, waMessage);

function getProofSrc(proof) {
  if (!proof) return "";
  if (proof.dataUrl) return proof.dataUrl;
  if (proof.filename) return `/uploads/${encodeURIComponent(proof.filename)}`;
  return "";
}

  const proofThumbnail = order.proof
    ? `<div class="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl p-2.5 flex items-center gap-2 border border-emerald-200">
        <svg class="w-4 h-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span class="font-bold text-xs">Bukti Transfer Berhasil Diunggah</span>
        <img src="${getProofSrc(order.proof)}" class="w-9 h-9 object-cover rounded-lg border border-gray-200 ml-auto cursor-pointer shadow-xs" onclick="if(document.getElementById('lightbox-img')){document.getElementById('lightbox-img').src=this.src; document.getElementById('lightbox').classList.remove('hidden');}" />
      </div>`
    : "";

  const paymentBlock =
    order.status === "menunggu_pembayaran"
      ? `
    <div class="border-t border-dashed border-gray-200 mt-3 pt-3">
      <div class="flex items-center justify-between mb-1.5">
        <p class="text-xs font-bold text-gray-800 flex items-center gap-1">
          <svg class="w-3.5 h-3.5 text-[--color-primary]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          <span>Instruksi Transfer (${escapeHtml(selectedBankKey)})</span>
        </p>
        <span class="bg-red-50 text-red-600 border border-red-200 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase">WAJIB BUKTI</span>
      </div>
      <div class="text-xs text-gray-600 space-y-1 mb-2 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
        <p>Bank Tujuan: <b>${escapeHtml(matchedBank.name || selectedBankKey)}</b></p>
        <div class="flex items-center justify-between">
          <p>No. Rek: <b class="font-mono text-sm text-gray-900">${escapeHtml(matchedBank.accountNumber || "-")}</b> <span class="text-gray-500 text-[11px]">(a.n. ${escapeHtml(matchedBank.accountName || "-")})</span></p>
          <button data-action="copy-bank" onclick="copyText('${escapeHtml(matchedBank.accountNumber || "")}', 'Nomor Rekening ${escapeHtml(selectedBankKey)}')" class="text-[11px] bg-white border border-gray-200 hover:border-[--color-primary] px-2 py-0.5 rounded font-semibold text-[--color-primary] shadow-xs">Salin</button>
        </div>
      </div>
      ${
        order.proof
          ? proofThumbnail
          : `<div class="space-y-2">
              <div class="flex flex-col sm:flex-row gap-2">
                <input id="proof-input-${escapeHtml(order.id)}" type="file" accept="image/*" class="text-xs flex-1 border border-gray-200 rounded-xl px-2.5 py-2 min-w-0 bg-gray-50 cursor-pointer" />
                <button data-proof-order="${escapeHtml(order.id)}" class="proof-upload-btn bg-[--color-primary] hover:bg-[--color-primary-dark] text-white text-xs font-bold rounded-xl px-3.5 py-2 whitespace-nowrap shadow-sm transition active:scale-95">Unggah Bukti</button>
              </div>
              <div id="proof-prev-wrap-${escapeHtml(order.id)}" class="hidden text-center">
                <img id="proof-prev-img-${escapeHtml(order.id)}" class="w-28 h-28 object-cover rounded-xl border border-gray-200 mx-auto shadow-sm" />
              </div>
              <p id="proof-error-${escapeHtml(order.id)}" class="text-xs text-red-500 hidden mt-1.5 font-medium text-center"></p>
            </div>`
      }
    </div>`
      : proofThumbnail;

  return `
    <div class="bg-white rounded-2xl p-4 border border-gray-100 mb-3 shadow-sm">
      <div class="flex justify-between items-start mb-1">
        <div>
          <p class="font-bold text-[--color-primary] text-base">#${escapeHtml(order.id)}</p>
          <p class="text-[11px] text-gray-400">Dipesan pada ${new Date(order.createdAt).toLocaleString("id-ID")}</p>
        </div>
        <span class="text-xs bg-blue-50 text-[--color-primary] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap border border-blue-100">${escapeHtml(statusFlow[currentIdx]?.label || order.status)}</span>
      </div>
      <div class="flex mb-4 mt-3">${steps}</div>
      <div class="border-t border-dashed border-gray-200 pt-2">
        ${itemsList}
        <div class="flex justify-between font-bold text-sm text-gray-900 mt-1">
          <span>Total</span><span class="text-[--color-primary]">${rupiah(order.total)}</span>
        </div>
      </div>
      <p class="text-xs text-gray-500 mt-2">Metode: <b>${escapeHtml(order.customer.method)}</b>${order.customer.detail ? " — " + escapeHtml(order.customer.detail) : ""}</p>
      ${paymentBlock}
      <a href="${waLink}" target="_blank" rel="noopener"
        class="mt-3 flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl py-3 transition shadow-sm active:scale-98">
        <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-0.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
        <span>Konfirmasi & Kirim Bukti via WhatsApp</span>
      </a>
    </div>
  `;
}

function attachTrackCardHandlers(resultEl, refresh) {
  resultEl.querySelectorAll('input[type="file"]').forEach((fileInput) => {
    const orderId = fileInput.id.replace("proof-input-", "");
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      const wrap = document.getElementById(`proof-prev-wrap-${orderId}`);
      const img = document.getElementById(`proof-prev-img-${orderId}`);
      if (wrap && img && file && file.type.startsWith("image/")) {
        img.src = URL.createObjectURL(file);
        wrap.classList.remove("hidden");
      } else if (wrap) {
        wrap.classList.add("hidden");
      }
    });
  });

  resultEl.querySelectorAll(".proof-upload-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const orderId = btn.dataset.proofOrder;
      const fileInput = document.getElementById(`proof-input-${orderId}`);
      const errEl = document.getElementById(`proof-error-${orderId}`);
      errEl.classList.add("hidden");
      if (!fileInput.files[0]) {
        errEl.textContent = "Pilih file foto bukti transfer terlebih dahulu.";
        errEl.classList.remove("hidden");
        return;
      }
      btn.disabled = true;
      btn.textContent = "Menyiapkan Foto...";
      try {
        const proofFile = await prepareProofFile(fileInput.files[0]);
        const fd = new FormData();
        fd.append("proof", proofFile);
        btn.textContent = "Mengunggah...";
        await Api.postForm(`/api/orders/${encodeURIComponent(orderId)}/proof`, fd);
        showSuccessModal(orderId);
        refresh();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("hidden");
        btn.disabled = false;
        btn.textContent = "Unggah Bukti";
      }
    });
  });
}

// ===== Utils =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===== Global click delegation =====
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  if (action === "add") {
    addToCart(id, 1);
    if (currentRoute().path === "katalog") {
      const gridContainer = document.getElementById("product-grid-container");
      if (gridContainer) gridContainer.innerHTML = renderProductGridHtml();
    }
  } else if (action === "inc") {
    addToCart(id, 1);
    if (currentRoute().path === "keranjang") renderKeranjang();
    else if (currentRoute().path === "katalog") {
      const gridContainer = document.getElementById("product-grid-container");
      if (gridContainer) gridContainer.innerHTML = renderProductGridHtml();
    }
  } else if (action === "dec") {
    addToCart(id, -1);
    if (currentRoute().path === "keranjang") renderKeranjang();
    else if (currentRoute().path === "katalog") {
      const gridContainer = document.getElementById("product-grid-container");
      if (gridContainer) gridContainer.innerHTML = renderProductGridHtml();
    }
  } else if (action === "remove") {
    setQtyExact(id, 0);
    renderKeranjang();
  } else if (action === "select-variant") {
    const group = el.dataset.group;
    const vid = el.dataset.vid;
    if (group && vid) {
      SELECTED_VARIANTS[group] = vid;
      const gridContainer = document.getElementById("product-grid-container");
      if (gridContainer) gridContainer.innerHTML = renderProductGridHtml();
    }
  } else if (action === "filter-cat") {
    activeCategory = el.dataset.cat;
    renderKatalog();
  } else if (action === "go-katalog") {
    navigate("#/katalog");
  } else if (action === "go-checkout") {
    navigate("#/checkout");
  } else if (action === "go-tracking") {
    navigate("#/tracking");
  } else if (action === "go-riwayat") {
    navigate("#/riwayat");
  } else if (action === "go-tracking-order") {
    navigate(`#/tracking/${encodeURIComponent(id)}`);
  } else if (action === "quick-track") {
    renderTracking(id);
  } else if (action === "copy-bank") {
    copyText(CONFIG.bank?.accountNumber || "", "Nomor Rekening");
  }
});

// ===== Init =====
async function init() {
  try {
    const [productData, config] = await Promise.all([Api.get("/api/products"), Api.get("/api/config")]);
    PRODUCTS = productData.products;
    CATEGORIES = productData.categories;
    CONFIG = config;

    document.getElementById("event-title").textContent = `Oleh-Oleh ${config.eventName}`;
    const waUrl = formatWaLink(
      config.adminWaNumber,
      "Halo Admin, saya ingin bertanya mengenai pemesanan oleh-oleh APTIRMIKI."
    );
    const waFloat = document.getElementById("wa-float");
    if (waFloat) waFloat.href = waUrl;
    const waBottom = document.getElementById("wa-bottom");
    if (waBottom) waBottom.href = waUrl;

    updateCartBadge();
    deadlineNoticeVisible = isSundayWib();
    render();
    window.setInterval(() => {
      const shouldShow = isSundayWib();
      if (shouldShow !== deadlineNoticeVisible) {
        deadlineNoticeVisible = shouldShow;
        if (currentRoute().path === "katalog") renderKatalog();
      }
    }, 60000);
  } catch (err) {
    app.innerHTML = `<div class="text-center py-24 text-gray-400 px-6">Gagal memuat data. Pastikan server backend berjalan.<br><span class="text-xs">${escapeHtml(err.message)}</span></div>`;
  }
}
init();
