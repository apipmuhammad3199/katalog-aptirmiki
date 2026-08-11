// Status pesanan tunggal yang berjalan progresif (4 tahap sesuai alur cafe modern).
const STATUS_FLOW = [
  { key: "menunggu_pembayaran", label: "Menunggu Pembayaran" },
  { key: "pembayaran_terverifikasi", label: "Pembayaran Terverifikasi" },
  { key: "diproses", label: "Pesanan Diproses / Dikemas" },
  { key: "selesai", label: "Siap Diambil / Selesai" },
];

const STATUS_KEYS = STATUS_FLOW.map((s) => s.key);

function isValidStatus(status) {
  return STATUS_KEYS.includes(status);
}

function statusIndex(status) {
  return STATUS_KEYS.indexOf(status);
}

module.exports = { STATUS_FLOW, STATUS_KEYS, isValidStatus, statusIndex };
