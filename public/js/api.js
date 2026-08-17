// Wrapper kecil untuk memanggil REST API backend.
const Api = {
  async request(method, url, { body, token, formData } = {}) {
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    let payload;
    if (formData) {
      payload = formData;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(url, { method, headers, body: payload });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request gagal (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get(url, opts) {
    return this.request("GET", url, opts);
  },
  post(url, body, opts = {}) {
    return this.request("POST", url, { ...opts, body });
  },
  postForm(url, formData, opts = {}) {
    return this.request("POST", url, { ...opts, formData });
  },
  put(url, body, opts = {}) {
    return this.request("PUT", url, { ...opts, body });
  },
  patch(url, body, opts = {}) {
    return this.request("PATCH", url, { ...opts, body });
  },
  delete(url, opts = {}) {
    return this.request("DELETE", url, opts);
  },
};
