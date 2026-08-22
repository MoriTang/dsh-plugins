window.__ModuleLoader__.load({
	id: "dsh-cost-balance",
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
  CostBalanceLine: () => CostBalanceLine,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/CostBalanceLine.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function useBalance(intervalMs) {
  const [payload, setPayload] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/cost-balance/balance");
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
  }, [intervalMs]);
  return payload;
}
function formatMoney(cost, currency) {
  if (cost === 0) return `${currency}0`;
  if (cost >= 100) return `${currency}${cost.toFixed(2)}`;
  if (cost >= 1) return `${currency}${cost.toFixed(3)}`;
  const magnitude = Math.floor(Math.log10(cost));
  const digits = 3 - magnitude;
  return `${currency}${cost.toFixed(Math.max(0, digits))}`;
}
function formatTokens(n) {
  if (n < 1e3) return String(n);
  if (n < 1e6) return `${Math.round(n / 1e3)}K`;
  return `${Math.round(n / 1e6)}M`;
}
var rowStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "var(--dsw-alias-label-tertiary)",
  fontSize: "12px",
  lineHeight: "18px",
  fontVariantNumeric: "tabular-nums",
  fontFamily: "var(--dsw-font-mono, monospace)"
};
var sepStyle = {
  opacity: 0.5
};
var CostBalanceLine = (0, import_react.memo)(function CostBalanceLine2({ useProjection }) {
  const view = useProjection("costBalance");
  const balance = useBalance(3e4);
  const groups = [];
  if (view !== void 0 && (view.inputTokens > 0 || view.outputTokens > 0 || view.cost > 0)) {
    groups.push(`cost ${formatMoney(view.cost, view.currency)}`);
    groups.push(`${formatTokens(view.inputTokens)} in \xB7 ${formatTokens(view.outputTokens)} out`);
  }
  const total = balance?.balance?.balance_infos.find((info) => info.currency === "CNY") ?? balance?.balance?.balance_infos[0];
  if (total !== void 0) {
    const symbol = total.currency === "CNY" ? "\xA5" : "$";
    groups.push(`balance ${symbol}${total.total_balance}`);
  } else if (balance?.lastError !== null && balance?.lastError !== void 0) {
    groups.push("balance unavailable");
  }
  if (groups.length === 0) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: rowStyle, children: groups.map((group, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
    i > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: sepStyle, children: " \xB7 " }),
    group
  ] }, group)) });
});

// src/client/index.ts
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
    name: "conversation.composer.dock",
    id: "cost-balance",
    // After the stats line (order 0) so the readout trails the token stats.
    order: 10
  }, CostBalanceLine));
}

		return module.exports;
	}
});
