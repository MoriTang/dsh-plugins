window.__ModuleLoader__.load({
	id: "dsh-tool-audit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  ToolAuditDock: () => ToolAuditDock,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/ToolAuditDock.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/audit-core.ts
function formatDuration(ms) {
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  const seconds = ms / 1e3;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${Math.round(seconds % 60)}s`;
}

// src/client/ToolAuditDock.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var ROW_HEIGHT = 20;
var MAX_ROWS = 8;
var panelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  width: "100%",
  maxHeight: ROW_HEIGHT * Math.min(MAX_ROWS, 4) + 4,
  overflowY: "auto",
  fontSize: "11px",
  lineHeight: `${ROW_HEIGHT}px`,
  fontFamily: "var(--dsw-font-mono, monospace)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--dsw-alias-label-tertiary)"
};
var rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  minWidth: 0
};
var nameStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  flex: "0 1 auto"
};
var spacerStyle = { flex: "1 1 auto" };
var durationStyle = {
  flex: "none",
  textAlign: "right"
};
var tagStyle = {
  flex: "none",
  fontSize: "10px",
  lineHeight: "14px",
  padding: "0 4px",
  borderRadius: "4px"
};
function outcomeColor(outcome) {
  switch (outcome) {
    case "ok":
      return "var(--dsw-alias-state-success-primary)";
    case "error":
      return "var(--dsw-static-red-500)";
    case "timeout":
      return "var(--dsw-static-amber-500)";
    case "aborted":
      return "var(--dsw-alias-label-tertiary)";
  }
}
function outcomeTag(outcome) {
  switch (outcome) {
    case "ok":
      return null;
    case "error":
      return "err";
    case "timeout":
      return "timeout";
    case "aborted":
      return "abort";
  }
}
function AuditRow({ record }) {
  const dot = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      style: {
        flex: "none",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: outcomeColor(record.outcome)
      }
    }
  );
  const tag = outcomeTag(record.outcome);
  const slowDuration = record.slow ? { color: "var(--dsw-static-amber-500)" } : void 0;
  const detail = [
    `${record.name} (${record.outcome}${record.errorCode !== null ? ` \xB7 ${record.errorCode}` : ""})`,
    `call ${record.callId}`,
    `started ${new Date(record.startedAt).toLocaleTimeString()} \xB7 ran ${formatDuration(record.durationMs)}${record.slow ? " \xB7 slow" : ""}`,
    record.argsPreview !== "" ? `args ${record.argsPreview}` : null
  ].filter((line) => line !== null).join("\n");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tooltip, { label: detail, side: "top", delayMs: 400, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: rowStyle, children: [
    dot,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: nameStyle, children: record.name }),
    tag !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...tagStyle, color: outcomeColor(record.outcome) }, children: tag }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: spacerStyle }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...durationStyle, ...slowDuration }, children: formatDuration(record.durationMs) })
  ] }) });
}
function useRecent(sessionId, intervalMs) {
  const [payload, setPayload] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (sessionId === void 0) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/tool-audit/recent?session=${encodeURIComponent(sessionId)}&limit=${MAX_ROWS}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPayload(data);
      } catch {
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, intervalMs]);
  return payload;
}
var ToolAuditDock = (0, import_react.memo)(function ToolAuditDock2({ session }) {
  const sessionId = session?.sessionId;
  const payload = useRecent(sessionId, 1200);
  const entries = payload?.entries ?? [];
  if (entries.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: panelStyle, children: entries.map((record) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuditRow, { record }, record.seq)) });
});

// src/client/index.ts
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
    name: "conversation.composer.dock",
    id: "tool-audit",
    // After the stats line (order 0) and the cost/balance readout (order 10).
    order: 20
  }, ToolAuditDock));
}

		return module.exports;
	}
});
