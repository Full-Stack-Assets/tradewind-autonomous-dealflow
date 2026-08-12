import { operatorHtml } from './operator-html.ts';

export function reviewOperatorHtml(): string {
  const notice = `<div role="note" style="position:relative;z-index:20;display:flex;align-items:flex-start;gap:12px;padding:11px 16px;border-bottom:1px solid rgba(139,255,175,.22);background:linear-gradient(90deg,rgba(115,245,155,.12),rgba(5,8,6,.96));color:#a9b9ae;font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:11px;line-height:1.55"><strong style="flex:none;color:#bfffd0;text-transform:uppercase;letter-spacing:.14em;font-size:9px">Post-merge review snapshot</strong><span><b style="color:#f3f8f4">Interface review only</b> · Synthetic simulation only. Operational values continue to hydrate from the existing readiness, workflow, source-health, and metrics endpoints.</span></div>`;
  return operatorHtml().replace('<body>', `<body>${notice}`);
}
