import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="wgeu-centered">
      <section className="wgeu-empty-card">
        <h1>Group Not Found</h1>
        <p>The share link may be invalid or expired.</p>
        <Link href="/" className="wgeu-button wgeu-button-primary">
          Back To Home
        </Link>
      </section>
    </main>
  );
}
