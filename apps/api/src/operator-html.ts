export function operatorHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#050806">
  <meta name="description" content="Autonomous Real Estate Acquisition Operations">
  <title>Tradewind DealFlow · Acquisition Operations</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050806;
      --line: rgba(139, 255, 175, 0.14);
      --line-strong: rgba(139, 255, 175, 0.28);
      --text: #f3f8f4;
      --muted: #84968a;
      --green: #73f59b;
      --danger: #ff7d82;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html { min-width: 320px; background: var(--bg); }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at 16% -10%, rgba(71, 255, 126, .12), transparent 30rem),
        radial-gradient(circle at 88% 4%, rgba(71, 255, 126, .07), transparent 24rem),
        linear-gradient(180deg, #070b08, #030504 70%);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: .18;
      background-image:
        repeating-radial-gradient(ellipse at 12% 20%, transparent 0 28px, rgba(99, 255, 148, .12) 29px 30px, transparent 31px 54px),
        linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
      background-size: 420px 300px, 48px 48px, 48px 48px;
      mask-image: linear-gradient(to bottom, #000, transparent 72%);
    }
    button, a { font: inherit; }
    button { color: inherit; }
    a { color: inherit; text-decoration: none; }
    .app { position: relative; display: grid; min-height: 100vh; grid-template-columns: 248px minmax(0, 1fr); }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 24px 18px;
      border-right: 1px solid var(--line);
      background: rgba(3, 7, 4, .86);
      backdrop-filter: blur(18px);
      display: flex;
      flex-direction: column;
      gap: 24px;
      z-index: 3;
    }
    .brand { display: flex; align-items: center; gap: 12px; padding: 4px 8px 18px; border-bottom: 1px solid var(--line); }
    .mark {
      width: 34px;
      height: 34px;
      border: 1px solid rgba(115,245,155,.55);
      border-radius: 11px 18px 11px 18px;
      transform: rotate(45deg);
      box-shadow: inset 0 0 18px rgba(115,245,155,.16), 0 0 24px rgba(115,245,155,.09);
      position: relative;
    }
    .mark::after { content: ""; position: absolute; inset: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 18px rgba(115,245,155,.7); }
    .brand strong { display: block; letter-spacing: -.02em; }
    .brand span { display: block; margin-top: 3px; color: var(--green); font-size: 10px; text-transform: uppercase; letter-spacing: .24em; }
    .nav { display: grid; gap: 7px; }
    .nav a {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 12px;
      border: 1px solid transparent;
      border-radius: 12px;
      color: #8fa095;
      font-size: 13px;
      transition: .18s ease;
    }
    .nav a:hover, .nav a.active { color: white; border-color: var(--line); background: linear-gradient(90deg, rgba(80,255,133,.13), rgba(80,255,133,.025)); }
    .nav a.active::before { background: var(--green); box-shadow: 0 0 14px rgba(115,245,155,.7); }
    .nav a::before { content: ""; width: 8px; height: 8px; border: 1px solid currentColor; border-radius: 3px; opacity: .8; }
    .workspace { margin-top: auto; padding: 14px; border: 1px solid var(--line); border-radius: 15px; background: rgba(255,255,255,.025); }
    .workspace strong { display: block; font-size: 13px; }
    .workspace span { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; }
    .main { min-width: 0; padding: 26px clamp(18px, 3vw, 42px) 48px; }
    .topbar { display: flex; gap: 18px; align-items: center; justify-content: space-between; margin-bottom: 34px; }
    .mode { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: rgba(64,255,121,.07); color: #caffd8; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
    .mode::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 13px rgba(115,245,155,.8); }
    .actions { display: flex; gap: 10px; align-items: center; }
    .button { cursor: pointer; border: 1px solid var(--line-strong); border-radius: 11px; padding: 10px 13px; background: rgba(255,255,255,.03); font-size: 12px; transition: .18s ease; }
    .button:hover { transform: translateY(-1px); border-color: rgba(115,245,155,.55); }
    .button.primary { color: #031006; border-color: transparent; background: linear-gradient(135deg, #8cffaa, #39df72); font-weight: 750; box-shadow: 0 12px 30px rgba(38,222,104,.15); }
    .hero { max-width: 880px; margin: 0 auto 30px; text-align: center; }
    .hero .kicker { margin: 0 0 14px; color: var(--green); font-size: 11px; text-transform: uppercase; letter-spacing: .3em; }
    .hero h1 { margin: 0; font-size: clamp(2.3rem, 6vw, 5.1rem); line-height: .98; letter-spacing: -.065em; }
    .hero h1 span { display: block; color: #9ea7a1; font-weight: 500; }
    .hero p { max-width: 650px; margin: 19px auto 0; color: var(--muted); line-height: 1.75; font-size: 14px; }
    .dashboard { border: 1px solid var(--line-strong); border-radius: 22px; overflow: hidden; background: rgba(5,10,7,.82); box-shadow: 0 30px 90px rgba(0,0,0,.48), 0 0 0 1px rgba(115,245,155,.025) inset; }
    .dashboard-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
    .dashboard-head h2 { margin: 0; font-size: 14px; letter-spacing: -.01em; }
    .dashboard-head p { margin: 4px 0 0; color: var(--muted); font-size: 11px; }
    .status-line { color: var(--muted); font-size: 11px; }
    .status-line.good { color: var(--green); }
    .status-line.bad { color: var(--danger); }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 1px; background: var(--line); }
    .metric { min-height: 116px; padding: 18px 20px; background: linear-gradient(145deg, #0b120d, #080c09); }
    .metric .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }
    .metric strong { display: block; margin-top: 14px; font-size: clamp(1.7rem, 4vw, 2.5rem); font-weight: 560; letter-spacing: -.04em; }
    .metric .change { display: block; margin-top: 8px; color: var(--green); font-size: 10px; }
    .content-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(290px, .75fr); min-height: 420px; }
    .panel { min-width: 0; padding: 20px; border-top: 1px solid var(--line); }
    .panel + .panel { border-left: 1px solid var(--line); }
    .panel-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .panel-title h3 { margin: 0; font-size: 13px; }
    .panel-title span { color: var(--muted); font-size: 10px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 620px; }
    th { padding: 9px 8px; color: #68786e; font-size: 9px; text-align: left; text-transform: uppercase; letter-spacing: .16em; font-weight: 600; border-bottom: 1px solid var(--line); }
    td { padding: 13px 8px; color: #bdc8c0; font-size: 11px; border-bottom: 1px solid rgba(139,255,175,.07); }
    td strong { color: #f2f7f3; font-weight: 600; }
    .stage { display: inline-flex; padding: 5px 8px; border: 1px solid rgba(115,245,155,.22); border-radius: 999px; background: rgba(115,245,155,.07); color: #b8ffca; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
    .empty-row { color: var(--muted); text-align: center; padding: 40px 12px; }
    .map-shell { position: relative; min-height: 330px; border: 1px solid rgba(115,245,155,.09); border-radius: 16px; overflow: hidden; background: radial-gradient(circle at 64% 46%, rgba(57,223,114,.11), transparent 45%), #070b08; }
    .map-shell svg { position: absolute; inset: 22px; width: calc(100% - 44px); height: calc(100% - 44px); filter: drop-shadow(0 0 20px rgba(57,223,114,.08)); }
    .map-dot { fill: var(--green); filter: drop-shadow(0 0 5px rgba(115,245,155,.8)); }
    .map-legend { position: absolute; left: 14px; bottom: 14px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 9px; background: rgba(3,7,4,.76); color: var(--muted); font-size: 9px; }
    .map-legend b { color: var(--green); font-weight: 600; }
    .footer-copy { max-width: 760px; margin: 32px auto 0; text-align: center; color: #b6c1b9; font-size: clamp(1.15rem, 2vw, 1.55rem); line-height: 1.5; }
    .pills { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
    .pill { padding: 8px 11px; border: 1px solid var(--line); border-radius: 999px; background: rgba(255,255,255,.025); color: #9eaca3; font-size: 10px; }
    .toast { position: fixed; right: 20px; bottom: 20px; max-width: 340px; padding: 13px 15px; border: 1px solid var(--line-strong); border-radius: 12px; background: rgba(4,10,6,.94); color: #d8e7dc; font-size: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.45); transform: translateY(18px); opacity: 0; pointer-events: none; transition: .2s ease; z-index: 10; }
    .toast.visible { transform: none; opacity: 1; }
    @media (max-width: 980px) {
      .app { grid-template-columns: 82px minmax(0,1fr); }
      .sidebar { padding: 20px 12px; }
      .brand-copy, .nav span, .workspace { display: none; }
      .brand { justify-content: center; padding-inline: 0; }
      .nav a { justify-content: center; padding: 12px; }
      .nav a::before { width: 10px; height: 10px; }
      .content-grid { grid-template-columns: 1fr; }
      .panel + .panel { border-left: 0; }
    }
    @media (max-width: 720px) {
      .app { display: block; }
      .sidebar { position: static; width: 100%; height: auto; flex-direction: row; align-items: center; padding: 12px 14px; border-right: 0; border-bottom: 1px solid var(--line); }
      .brand { padding: 0; border: 0; }
      .mark { width: 27px; height: 27px; }
      .nav { display: none; }
      .workspace { display: block; margin: 0 0 0 auto; padding: 7px 9px; }
      .workspace span { display: none; }
      .main { padding: 18px 14px 38px; }
      .topbar { align-items: flex-start; }
      .mode { font-size: 9px; letter-spacing: .08em; }
      .actions .button:not(.primary) { display: none; }
      .metrics { grid-template-columns: repeat(2, minmax(0,1fr)); }
      .metric { min-height: 102px; }
      .dashboard-head { align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar" aria-label="DealFlow navigation">
      <a class="brand" href="#overview" aria-label="Tradewind DealFlow overview">
        <span class="mark" aria-hidden="true"></span>
        <span class="brand-copy"><strong>Tradewind</strong><span>DealFlow</span></span>
      </a>
      <nav class="nav">
        <a class="active" href="#overview"><span>Overview</span></a>
        <a href="#deals"><span>Deals</span></a>
        <a href="#pipeline"><span>Pipeline</span></a>
        <a href="#sources"><span>Sources</span></a>
        <a href="/v1/events"><span>Receipts</span></a>
        <a href="/v1/metrics"><span>Metrics</span></a>
      </nav>
      <div class="workspace"><strong>Tradewind Capital</strong><span>Acquisition operations · review branch</span></div>
    </aside>

    <main class="main" id="overview">
      <div class="topbar">
        <span class="mode">Simulation-only review surface</span>
        <div class="actions">
          <button class="button" type="button" data-action="refresh">Refresh data</button>
          <button class="button primary" type="button" data-action="run-simulation">Run synthetic deal</button>
        </div>
      </div>

      <header class="hero">
        <p class="kicker">Tradewind DealFlow</p>
        <h1>Autonomous Real Estate <span>Acquisition Operations</span></h1>
        <p>Source, qualify, govern, and verify acquisition workflows from one operational surface. This review UI reads the existing API and keeps every consequential action inside the current synthetic, human-gated boundary.</p>
      </header>

      <section class="dashboard" id="pipeline" aria-label="DealFlow dashboard">
        <div class="dashboard-head">
          <div><h2>Deals overview</h2><p>Live data from the current workflow, source-health, readiness, and telemetry endpoints.</p></div>
          <span class="status-line" data-status>Connecting…</span>
        </div>
        <div class="metrics">
          <article class="metric"><span class="label">Acquisition runs</span><strong data-metric="total">—</strong><span class="change">All recorded workflows</span></article>
          <article class="metric"><span class="label">Active deals</span><strong data-metric="active">—</strong><span class="change">Non-terminal workflows</span></article>
          <article class="metric"><span class="label">Verified archive</span><strong data-metric="archived">—</strong><span class="change">Terminal simulation receipts</span></article>
          <article class="metric"><span class="label">Healthy sources</span><strong data-metric="sources">—</strong><span class="change">Current source readiness</span></article>
        </div>
        <div class="content-grid">
          <section class="panel" id="deals">
            <div class="panel-title"><h3>Recent workflows</h3><span data-workflow-count>Loading</span></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Workflow</th><th>State</th><th>Status</th><th>Source</th><th>Updated</th></tr></thead>
                <tbody data-workflows><tr><td colspan="5" class="empty-row">Loading workflow history…</td></tr></tbody>
              </table>
            </div>
          </section>
          <section class="panel" id="sources">
            <div class="panel-title"><h3>Source coverage</h3><span data-source-count>Loading</span></div>
            <div class="map-shell" aria-label="Configured source coverage visualization">
              <svg viewBox="0 0 520 300" role="img" aria-label="Abstract eastern United States source map">
                <path d="M65 62 L118 43 L174 51 L221 43 L263 55 L297 50 L341 67 L367 83 L402 91 L429 116 L450 145 L443 169 L462 191 L449 214 L430 218 L418 244 L389 256 L373 281 L352 270 L342 238 L319 222 L304 194 L281 181 L261 160 L233 158 L210 140 L174 138 L153 115 L113 104 L87 88 Z" fill="rgba(61,111,74,.28)" stroke="rgba(115,245,155,.32)" stroke-width="1.5"/>
                <path d="M260 57 L268 238 M316 67 L326 224 M370 84 L378 242 M188 52 L198 141 M112 62 L126 105 M224 44 L235 158" stroke="rgba(115,245,155,.08)" stroke-width="1"/>
                <circle class="map-dot" cx="378" cy="111" r="5"/><circle class="map-dot" cx="395" cy="134" r="4"/><circle class="map-dot" cx="408" cy="160" r="5"/><circle class="map-dot" cx="386" cy="191" r="4"/><circle class="map-dot" cx="352" cy="214" r="5"/><circle class="map-dot" cx="342" cy="245" r="4"/><circle class="map-dot" cx="295" cy="151" r="4"/><circle class="map-dot" cx="247" cy="128" r="4"/>
              </svg>
              <div class="map-legend"><b>●</b> Configured acquisition sources</div>
            </div>
          </section>
        </div>
      </section>

      <p class="footer-copy">End-to-end deal sourcing and qualification with durable checkpoints, explicit approvals, source health, audit receipts, and governed execution.</p>
      <div class="pills"><span class="pill">Real Estate</span><span class="pill">Workflow Automation</span><span class="pill">Data &amp; Maps</span><span class="pill">Synthetic Review</span></div>
    </main>
  </div>
  <div class="toast" role="status" aria-live="polite" data-toast></div>

  <script>
    (function () {
      var workflowBody = document.querySelector('[data-workflows]');
      var statusNode = document.querySelector('[data-status]');
      var toastNode = document.querySelector('[data-toast]');

      function text(selector, value) {
        var node = document.querySelector(selector);
        if (node) node.textContent = String(value);
      }

      function escape(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function showToast(message) {
        if (!toastNode) return;
        toastNode.textContent = message;
        toastNode.classList.add('visible');
        window.setTimeout(function () { toastNode.classList.remove('visible'); }, 3400);
      }

      function stateOf(workflow) {
        return workflow.state || workflow.currentState || 'UNKNOWN';
      }

      function statusOf(workflow) {
        return workflow.status || (stateOf(workflow) === 'ARCHIVED' ? 'completed' : 'active');
      }

      function renderWorkflows(workflows) {
        text('[data-workflow-count]', workflows.length + (workflows.length === 1 ? ' workflow' : ' workflows'));
        if (!workflowBody) return;
        if (!workflows.length) {
          workflowBody.innerHTML = '<tr><td colspan="5" class="empty-row">No workflows yet. Run a synthetic deal to create a verified review record.</td></tr>';
          return;
        }
        workflowBody.innerHTML = workflows.slice().reverse().slice(0, 8).map(function (workflow) {
          var id = workflow.workflowId || workflow.id || 'unassigned';
          var state = stateOf(workflow);
          var status = statusOf(workflow);
          var source = workflow.sourceId || workflow.sourceRecordId || 'synthetic fixture';
          var updated = workflow.updatedAt || workflow.lastTransitionAt || workflow.createdAt || 'recorded';
          return '<tr><td><strong>' + escape(String(id).slice(0, 18)) + '</strong></td><td><span class="stage">' + escape(state) + '</span></td><td>' + escape(status) + '</td><td>' + escape(source) + '</td><td>' + escape(updated) + '</td></tr>';
        }).join('');
      }

      async function getJson(path) {
        var response = await fetch(path, { headers: { accept: 'application/json' } });
        if (!response.ok) {
          var detail = await response.json().catch(function () { return {}; });
          var message = detail && detail.error && detail.error.message ? detail.error.message : path + ' returned ' + response.status;
          throw new Error(message);
        }
        return response.json();
      }

      async function hydrate() {
        if (statusNode) { statusNode.textContent = 'Refreshing…'; statusNode.className = 'status-line'; }
        try {
          var responses = await Promise.all([
            getJson('/ready'),
            getJson('/v1/workflows'),
            getJson('/v1/sources'),
            getJson('/v1/metrics')
          ]);
          var readiness = responses[0];
          var workflows = Array.isArray(responses[1].workflows) ? responses[1].workflows : [];
          var sources = Array.isArray(responses[2].sources) ? responses[2].sources : [];
          var active = workflows.filter(function (workflow) { return stateOf(workflow) !== 'ARCHIVED' && statusOf(workflow) !== 'completed'; }).length;
          var archived = workflows.filter(function (workflow) { return stateOf(workflow) === 'ARCHIVED' || statusOf(workflow) === 'completed'; }).length;
          var healthy = sources.filter(function (source) { return source.status === 'healthy' || source.status === 'ok'; }).length;
          text('[data-metric="total"]', workflows.length);
          text('[data-metric="active"]', active);
          text('[data-metric="archived"]', archived);
          text('[data-metric="sources"]', healthy + '/' + sources.length);
          text('[data-source-count]', sources.length + (sources.length === 1 ? ' source' : ' sources'));
          renderWorkflows(workflows);
          if (statusNode) {
            statusNode.textContent = readiness.ready ? 'Systems ready' : 'Readiness checks incomplete';
            statusNode.className = 'status-line ' + (readiness.ready ? 'good' : 'bad');
          }
        } catch (error) {
          if (statusNode) { statusNode.textContent = error.message || 'Unable to load data'; statusNode.className = 'status-line bad'; }
          showToast(error.message || 'Unable to load operator data');
        }
      }

      async function runSimulation(button) {
        button.disabled = true;
        button.textContent = 'Running…';
        try {
          var response = await fetch('/v1/simulations', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ mode: 'synthetic' })
          });
          var payload = await response.json().catch(function () { return {}; });
          if (!response.ok) {
            var message = payload && payload.error && payload.error.message ? payload.error.message : 'Simulation request failed';
            throw new Error(message);
          }
          showToast('Synthetic workflow created: ' + (payload.workflowId || payload.state || 'recorded'));
          await hydrate();
        } catch (error) {
          showToast(error.message || 'Simulation request failed');
        } finally {
          button.disabled = false;
          button.textContent = 'Run synthetic deal';
        }
      }

      document.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        var refreshButton = target.closest('[data-action="refresh"]');
        if (refreshButton) { hydrate(); return; }
        var simulationButton = target.closest('[data-action="run-simulation"]');
        if (simulationButton instanceof HTMLButtonElement) runSimulation(simulationButton);
      });

      hydrate();
      window.setInterval(hydrate, 30000);
    }());
  </script>
</body>
</html>`;
}
