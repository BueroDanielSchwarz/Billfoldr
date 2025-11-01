import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head><title>Billfoldr Billing</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <main style={{maxWidth: 720, margin: '40px auto', padding: '0 16px', fontFamily: 'system-ui'}}>
        <h1 style={{fontSize: 28, marginBottom: 12}}>Billfoldr – Billing</h1>
        <p>Willkommen! Diese Site startet den Web-Checkout und verwaltet das Abo für Billfoldr Web-Services &amp; Cloud-Funktionen.</p>
        <ul style={{marginTop: 16, lineHeight: 1.7}}>
          <li><code>/pay?uid=&lt;USER_ID&gt;</code> – startet den Checkout</li>
          <li><code>/billing/success</code> – Erfolg</li>
          <li><code>/billing/cancel</code> – abgebrochen</li>
        </ul>
        <p style={{marginTop: 24}}>
          <Link href="/billing/success">Test Erfolg</Link> &nbsp;·&nbsp; <Link href="/billing/cancel">Test Abbruch</Link>
        </p>
      </main>
    </>
  );
}
