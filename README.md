# 🎁 Katalog Oleh-Oleh APTIRMIKI

Web Ordering Catalog interaktif untuk pemesanan Oleh-Oleh Resmi Acara APTIRMIKI
(Tema: Oleh-Oleh Khas Jakarta). Alur seperti menu digital cafe modern: pilih
produk, checkout, bayar, lacak status — plus dashboard admin untuk rekap
pesanan.

## Teknologi

- **Backend:** Node.js + Express, penyimpanan data berbasis file JSON
  (`data/db.json`) — tanpa perlu install database terpisah, cocok untuk
  kebutuhan acara.
- **Frontend:** HTML + JavaScript murni (tanpa build step) + Tailwind CSS
  (CDN), mobile-first.
- **Upload bukti transfer:** disimpan di `data/uploads/`.

## Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env
# edit .env: ganti ADMIN_PASSWORD, ADMIN_WA_NUMBER, info rekening bank
npm start
```

Buka:
- Katalog pelanggan: http://localhost:3000
- Dashboard admin: http://localhost:3000/admin (password sesuai `.env`)

## Konfigurasi (`.env`)

| Variabel | Keterangan |
|---|---|
| `PORT` | Port server (default 3000) |
| `ADMIN_PASSWORD` | Password login dashboard admin — **wajib diganti** sebelum acara |
| `ADMIN_WA_NUMBER` | Nomor WA admin format internasional tanpa `+`, mis. `6281234567890` |
| `BANK_NAME`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME` | Info rekening yang tampil di halaman konfirmasi pembayaran |
| `QRIS_IMAGE_URL` | (Opsional) URL gambar QRIS |
| `EVENT_NAME` | Nama acara yang tampil di header |

## Struktur Alur

**Pelanggan** (`/`): Katalog & filter kategori/pencarian → Keranjang
(floating cart) → Checkout (data pemesan + metode pengambilan) → Konfirmasi
(ID pesanan unik `APT-xxxx`, info rekening/QRIS, upload bukti transfer,
tombol konfirmasi via WhatsApp) → Lacak Pesanan (status real-time berdasarkan
ID atau nomor WA).

**Admin** (`/admin`): Login password → Rekap seluruh pesanan (nama, instansi,
barang, total, bukti transfer) → Ubah status pesanan → Export CSV → Rekap
total item terpesan per produk untuk packing/restock.

## Mengubah Katalog Produk

Edit langsung [src/products.js](src/products.js) — tambah/ubah/hapus item,
harga, deskripsi, atau kategori tanpa menyentuh kode lain.

## Menambahkan Foto Produk Asli

Secara default produk memakai ikon emoji sebagai placeholder visual. Untuk
memakai foto asli, isi field `image` pada `src/products.js` dengan URL foto,
lalu render `<img>` di `public/js/app.js` (fungsi `renderKatalog`) sebagai
pengganti emoji `p.icon`.

## Deploy untuk Hari-H Acara

Aplikasi ini butuh proses Node.js yang berjalan terus (server, bukan hosting
statis) karena rekap pesanan admin & tracking memakai data pesanan yang
sama untuk semua pengguna. Opsi termudah:

- **VPS/laptop panitia:** `npm start` lalu expose lewat jaringan venue/hotspot,
  atau pakai layanan tunnel sementara (mis. ngrok/Cloudflare Tunnel) agar bisa
  diakses via internet.
- **Platform Node.js hosting** (Railway, Render, Fly.io, dsb.): deploy folder
  ini sebagai Node app, set environment variable sesuai `.env.example`.

⚠️ Catatan: `data/db.json` disimpan di filesystem lokal server. Pada
platform dengan filesystem ephemeral (reset saat redeploy), gunakan volume
persisten atau backup rutin via fitur Export CSV di dashboard admin.

## Keamanan (Prototipe / Skala Acara)

Autentikasi admin bersifat sederhana (satu password bersama, sesi in-memory)
— cukup untuk kebutuhan panitia selama acara, namun bukan sistem multi-user
dengan role terpisah. Jangan gunakan password default `admin123` saat live.
