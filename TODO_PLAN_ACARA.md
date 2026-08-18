# 📋 TO-DO LIST & PANDUAN PERSIAPAN ACARA APTIRMIKI

Dokumen ini berisi rencana aksi (*Action Plan*) untuk memastikan seluruh alur pemesanan oleh-oleh APTIRMIKI di domain live (**[https://aptirmiki.store](https://aptirmiki.store)**) berjalan lancar, tersimpan permanen di cloud, dan data transaksi tidak hilang.

---

## 🎯 Ringkasan Masalah & Solusi
- **Masalah:** Di domain live Vercel, server berjalan dalam mode *Serverless Function* (tanpa harddisk fisik). Saat tidak ada request, Vercel mematikan container (*sleep*), sehingga file `/tmp` di-reset dan pesanan hilang jika belum disambungkan ke Storage Cloud.
- **Solusi:** Menghubungkan database cloud gratis **Vercel KV (Serverless Redis)** via Dashboard Vercel (estimasi pengerjaan: 2 menit). Kode website sudah dilengkapi adapter otomatis untuk langsung mengenali database ini.

---

## 📅 Action Plan / To-Do List

### Phase 1: Setup Database Cloud Permanen di Vercel (Estimasi: 2 Menit)
- [ ] **Langkah 1:** Buka dan login ke dashboard **[vercel.com](https://vercel.com)**.
- [ ] **Langkah 2:** Pilih project **`katalog-aptirmiki`** (domain `aptirmiki.store`).
- [ ] **Langkah 3:** Klik menu tab **Storage** di bar navigasi atas.
- [ ] **Langkah 4:** Klik tombol **Create Database** $\rightarrow$ Pilih **KV (Serverless Redis)**.
- [ ] **Langkah 5:** Beri nama database `aptirmiki-db` $\rightarrow$ Pilih region terdekat (misal *Singapore (sin1)* atau *Washington DC*) $\rightarrow$ Klik **Create**.
- [ ] **Langkah 6:** Klik tombol **Connect to Project** $\rightarrow$ Pilih project Anda $\rightarrow$ Klik **Connect**.
- [ ] **Langkah 7:** Buka tab **Deployments** di Vercel $\rightarrow$ Klik menu titik tiga `...` pada deployment terbaru $\rightarrow$ Pilih **Redeploy**.

---

### Phase 2: Uji Coba Transaksi & Verifikasi Live (Estimasi: 3 Menit)
- [ ] **Langkah 1:** Buka katalog di HP / browser melalui link **[https://aptirmiki.store](https://aptirmiki.store)**.
- [ ] **Langkah 2:** Tambahkan produk ke keranjang $\rightarrow$ Lakukan Checkout $\rightarrow$ Masukkan data pemesan $\rightarrow$ Pilih Bank $\rightarrow$ Buat Pesanan.
- [ ] **Langkah 3:** Unggah foto bukti transfer pada formulir konfirmasi.
- [ ] **Langkah 4:** Buka Dashboard Admin di **[https://aptirmiki.store/admin](https://aptirmiki.store/admin)**.
- [ ] **Langkah 5:** Verifikasi data pesanan muncul lengkap (Nama, Instansi, Produk, Metode Pengambilan, Pilihan Bank, dan Foto Bukti Pembayaran).
- [ ] **Langkah 6 (Uji Ketahanan):** Tutup browser, tunggu 5–10 menit, lalu buka kembali Dashboard Admin. **Pastikan seluruh data pesanan dan omset tetap utuh 100%.**

---

### Phase 3: Persiapan Operasional Acara Panitia
- [ ] **Rekening Resmi Pembayaran:**
  - **BCA:** `7235088592` — a.n. **AMIK Panitia APTIRMIKI**
  - **BSI:** `7360123728` — a.n. **APTIRMIKI KORWIL 3 (BSI)**
  - **Mandiri:** `1110021969031` — a.n. **Puteri Fannya (Panitia APTIRMIKI)**
- [ ] **Nomor WhatsApp Admin:** Pastikan nomor `6287714001014` aktif menerima pesan konfirmasi & lampiran bukti bayar.
- [ ] **QR Code Banner / Meja Registrasi:** Siapkan QR Code yang mengarah ke link [https://aptirmiki.store](https://aptirmiki.store).
- [ ] **Fitur Rekap & Ekspor:** Uji tombol **Export CSV** di Dashboard Admin untuk keperluan rekap pesanan ke supplier Kartika Sari Bandung.

---

### 📌 Catatan Tambahan (Alternatif Deployment):
Jika panitia tidak ingin mengatur Storage di Vercel, website dapat dijalankan langsung di server Node.js permanen (seperti VPS, Railway, atau Render) dengan menjalankan perintah:
```bash
npm start
```
File database `data/db.json` akan otomatis tersimpan di harddisk server tanpa risiko ter-reset.
