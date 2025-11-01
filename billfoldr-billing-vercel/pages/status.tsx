import Head from 'next/head';
import { useEffect, useState } from 'react';

type Status = { active: boolean; current_period_end?: string | null; docs_this_month?: number; base?: number; };

export default function StatusPage() {
  const [uid, setUid] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/billing/status?uid=${encodeURIComponent(uid)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setStatus(j);
    } catch (e: any) { setErr(e?.message || 'Fehler'); }
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const u = p.get('uid'); if (u) setUid(u);
  }, []);

  return (
    <>
      <Head><title>Billfoldr – Status</title></Head>
      <main style={{maxWidth: 720, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui'}}>
        <h1 style={{fontSize: 24, marginBottom: 12}}>Abo-Status prüfen</h1>
        <div style={{display:'flex', gap:8}}>
          <input value={uid} onChange={e => setUid(e.target.value)} placeholder="uid"
                 style={{flex:1, padding:8, border:'1px solid #ccc', borderRadius:8}} />
          <button onClick={load} style={{padding:'8px 14px', borderRadius:8}}>Prüfen</button>
        </div>
        {err && <p style={{color:'#900', marginTop:12}}>{err}</p>}
        {status && <pre style={{marginTop:16, background:'#f6f6f6', padding:12, borderRadius:8}}>{JSON.stringify(status, null, 2)}</pre>}
      </main>
    </>
  );
}
