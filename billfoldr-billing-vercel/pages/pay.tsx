import { useEffect, useState } from 'react';
import Head from 'next/head';

export default function PayPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get('uid');
    const ret = params.get('return'); // optional

    async function run() {
      try {
        if (!uid) {
          setError('Parameter "uid" fehlt.');
          return;
        }
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid,
            // returnTo: `${window.location.origin}/billing/success${ret ? `?return=${encodeURIComponent(ret)}` : ''}`
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ? JSON.stringify(j.error) : `HTTP ${res.status}`);
        }
        const { url } = await res.json();
        if (!url) throw new Error('Keine Checkout-URL erhalten.');
        window.location.href = url;
      } catch (e: any) {
        setError(e?.message || 'Unbekannter Fehler');
      }
    }
    run();
  }, []);

  return (
    <>
      <Head><title>Billfoldr – Weiterleitung zum Checkout…</title></Head>
      <main style={{maxWidth: 720, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui'}}>
        <h1 style={{fontSize: 24, marginBottom: 8}}>Weiterleitung zum Checkout…</h1>
        <p>Bitte warten. Du wirst zu Stripe weitergeleitet.</p>
        {error && (
          <div style={{marginTop: 16, padding: 12, background: '#fee', color: '#900', borderRadius: 8}}>
            <strong>Fehler:</strong> {error}
          </div>
        )}
      </main>
    </>
  );
}
