import { CreateGroupForm } from "@/components/create-group-form";
import { hasSupabaseServerEnv } from "@/lib/env";

export default function Home() {
  const configured = hasSupabaseServerEnv();

  return (
    <main className="wgeu-root wgeu-home-page">
      <section className="wgeu-home-shell">
        <section className="wgeu-home-hero">
          <p className="wgeu-eyebrow">WGEU · Where The Group Ended Up</p>
          <h1>One link for your group, one living map for every story.</h1>
          <p className="wgeu-subtitle">
            Start a shared board in seconds, collect updates from everyone, and watch where your
            people ended up around the world.
          </p>
          <div className="wgeu-chip-row">
            <span className="wgeu-chip">World to City</span>
            <span className="wgeu-chip">LinkedIn Profiles</span>
            <span className="wgeu-chip">Live Map Capsules</span>
          </div>
        </section>

        <section className="wgeu-home-create">
          <div className="wgeu-creator-copy">
            <h2>Create Your Board</h2>
            <p>
              You will get a public share link and a private admin link. Keep the admin link secure.
            </p>
            {!configured ? (
              <div className="wgeu-config-warning">
                Missing Supabase env vars. Add them to `.env.local` before creating links.
              </div>
            ) : null}
          </div>
          <CreateGroupForm />
        </section>
      </section>
    </main>
  );
}

