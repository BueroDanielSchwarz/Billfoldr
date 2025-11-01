import Head from 'next/head';
import Link from 'next/link';
import { useMemo } from 'react';

export default function SuccessPage() {
  const returnUrl = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search);
    return p.get('return');
  }, []);

  return (
    <>
      <Head><title>Billfoldr – Cloud freigeschaltet</title></Head>
      <main style={{maxWidth: 720, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui'}}>
        <h1 style={{fontSize: 28, marginBottom: 8}}>Erfolg!</h1>
        <p>Dein Abo wurde aktiviert. Die Billfoldr Web-Services &amp; Cloud-Funktionen stehen dir jetzt zur Verfügung.</p>
        <div style={{marginTop: 24}}>
          {returnUrl ? (
            <a href={returnUrl}
               style={{display:'inline-block', padding:'10px 16px', background:'#0a7', color:'#fff', borderRadius:8, textDecoration:'none'}}>
              Zurück zur App
            </a>
          ) : (
            <Link href="/" style={{textDecoration:'none'}}>
              <span style={{display:'inline-block', padding:'10px 16px', background:'#0a7', color:'#fff', borderRadius:8}}>
                Zur Startseite
              </span>
            </Link>
          )}
        </div>
        <p style={{marginTop: 24, color:'#555'}}>In der App kannst du den Status prüfen. (Entitlement wird per Stripe-Webhook gesetzt.)</p>
      </main>
    </>
  );
}
