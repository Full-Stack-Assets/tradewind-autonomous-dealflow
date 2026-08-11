export function operatorHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tradewind Autonomous DealFlow</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #07111f; color: #e6edf7; }
    body { margin: 0; padding: 32px; }
    main { max-width: 1100px; margin: auto; }
    header { margin-bottom: 28px; }
    h1 { font-size: clamp(2rem, 5vw, 4rem); line-height: 1; margin: 0 0 12px; }
    p { color: #9fb0c6; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
    section { border: 1px solid #243449; border-radius: 14px; background: #0d1a2b; padding: 20px; }
    code { color: #91e0c3; }
  </style>
</head>
<body>
<main>
  <header><h1>Tradewind Autonomous DealFlow</h1><p>Durable, source-aware lifecycle operations with deterministic local verification.</p></header>
  <div class="grid">
    <section><h2>Lifecycle</h2><p>Ingestion → qualification → enrichment → seller → documents → buyer → closing → archive.</p></section>
    <section><h2>Source health</h2><p>MassGIS statewide parcels and municipality-specific Rhode Island registries are exposed at <code>/v1/sources</code>.</p></section>
    <section><h2>Exceptions</h2><p>Failed workflow stages persist durable context and can be resumed without replaying completed work.</p></section>
  </div>
</main>
</body>
</html>`;
}
