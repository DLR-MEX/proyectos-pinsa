// SSE client con reconexión exponencial. close() cancela el timer de reconexión
// para evitar que un EventSource fantasma se reabra después.

export function openStream(url, { onSnapshot, onData, onConnect, onError } = {}) {
  let es;
  let backoff = 500;
  const MAX_BACKOFF = 15000;
  let reconnectTimer = null;
  let closed = false;

  function connect() {
    if (closed) return;
    es = new EventSource(url);

    es.addEventListener('open', () => {
      backoff = 500;
      onConnect?.();
    });

    es.addEventListener('snapshot', (evt) => {
      try { onSnapshot?.(JSON.parse(evt.data)); }
      catch (e) { console.warn('snapshot parse:', e.message); }
    });

    es.addEventListener('data', (evt) => {
      try { onData?.(JSON.parse(evt.data)); }
      catch (e) { console.warn('data parse:', e.message); }
    });

    es.addEventListener('error', () => {
      onError?.();
      es.close();
      if (closed) return;
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      reconnectTimer = setTimeout(connect, backoff);
    });
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      es?.close();
    },
  };
}
