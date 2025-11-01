import Head from 'next/head';
import Link from 'next/link';

export default function CancelPage() {
  return (
    <>
      <Head><title>Billfoldr – Checkout abgebrochen</title></Head>
      <main style={{maxWidth: 720, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui'}}>
        <h1 style={{fontSize: 28, marginBottom: 8}}>Checkout abgebrochen</h1>
        <p>Du hast den Bezahlvorgang abgebrochen. Du kannst es jederzeit erneut versuchen.</p>
        <div style={{marginTop: 24}}>
          <Link href="/pay" style={{textDecoration:'none'}}>
            <span style={{display:'inline-block', padding:'10px 16px', background:'#333', color:'#fff', borderRadius:8}}>
              Erneut versuchen
            </span>
          </Link>
        </div>
      </main>
    </>
  );
}
