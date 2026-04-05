import { CreateGroupForm } from "@/components/create-group-form";
import { hasSupabaseServerEnv } from "@/lib/env";

export default function Home() {
  const configured = hasSupabaseServerEnv();

  return (
    <main className="wgeu-root wgeu-home-page">
      <section className="wgeu-home-shell">
        <section className="wgeu-home-hero">
          <div className="wgeu-home-hero-card">
            <p className="wgeu-eyebrow">Alum Atlas</p>
            <h1>Build your alumni atlas.</h1>
            <p className="wgeu-subtitle">
              For student organizations across the U.S. to track where members start their careers
              after graduation.
            </p>
          </div>
          <div className="wgeu-home-lower">
            <div className="wgeu-home-image-quad" aria-hidden="true">
              <figure className="wgeu-home-image-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=900&q=80"
                  alt=""
                />
              </figure>
              <figure className="wgeu-home-image-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&w=900&q=80"
                  alt=""
                />
              </figure>
              <figure className="wgeu-home-image-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80"
                  alt=""
                />
              </figure>
              <figure className="wgeu-home-image-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=900&q=80"
                  alt=""
                />
              </figure>
            </div>
          </div>
        </section>

        <section className="wgeu-home-create">
          <div className="wgeu-home-create-inner">
            <div className="wgeu-creator-copy">
              <h2>Start a board</h2>
              <p>Generate a member link and a private admin link for your organization.</p>
              {!configured ? (
                <div className="wgeu-config-warning">
                  Missing Supabase env vars. Add them to `.env.local` before creating links.
                </div>
              ) : null}
            </div>
            <CreateGroupForm />
          </div>
        </section>
      </section>
    </main>
  );
}
