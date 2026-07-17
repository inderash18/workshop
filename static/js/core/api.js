const API = {
  async request(method, url, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body && method !== 'GET') {
      opts.body = JSON.stringify(body);
    }
    try {
      const res = await fetch(url, opts);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || data.message || `Request failed (${res.status})`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err.status) throw err;
      const netErr = new Error('Network error. Please check your connection.');
      netErr.status = 0;
      throw netErr;
    }
  },

  get(url) {
    return this.request('GET', url);
  },

  post(url, body) {
    return this.request('POST', url, body);
  },

  put(url, body) {
    return this.request('PUT', url, body);
  },

  delete(url) {
    return this.request('DELETE', url);
  },
};
