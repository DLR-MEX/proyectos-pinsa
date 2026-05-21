// Cliente SSE con reconexión exponencial cancelable. Emite eventos al callback.

export function connect({ onSnapshot, onHydrate, onMov, onAlert, onStatus }) {
  let es = null;
  let retry = 1000;
  let stopped = false;

  function open() {
    if (stopped) return;
    onStatus?.('connecting');
    es = new EventSource('/api/stream');

    es.addEventListener('open', () => {
      retry = 1000;
      onStatus?.('ok');
    });

    es.addEventListener('snapshot', (e) => {
      try { onSnapshot?.(JSON.parse(e.data)); } catch {}
    });
    es.addEventListener('hydrate', (e) => {
      try { onHydrate?.(JSON.parse(e.data)); } catch {}
    });
    es.addEventListener('mov', (e) => {
      try { onMov?.(JSON.parse(e.data)); } catch {}
    });
    es.addEventListener('alert', (e) => {
      try { onAlert?.(JSON.parse(e.data)); } catch {}
    });

    es.addEventListener('error', () => {
      onStatus?.('err');
      es?.close();
      es = null;
      retry = Math.min(retry * 2, 15000);
      setTimeout(open, retry);
    });
  }

  open();

  return {
    close() { stopped = true; es?.close(); es = null; },
  };
}
