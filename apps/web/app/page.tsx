import { getApiBaseUrl } from '../lib/api-client';

export default function HomePage() {
  return (
    <main className="container">
      <h1>PokePredict Phase 0</h1>
      <p>This is a scaffold-only build. Product features begin in Phase 1.</p>
      <p>
        API base URL from environment: <code>{getApiBaseUrl()}</code>
      </p>
    </main>
  );
}
