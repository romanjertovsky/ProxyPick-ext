const DEFAULT_STATE = {
  proxies: [],
  activeProxy: null,
  connectionMode: "system"
};

let currentAuth = null;
const SUPPORTED_SCHEMES = new Set(["http", "socks4", "socks5"]);

function splitComment(line) {
  const idx = line.indexOf("#");
  if (idx === -1) {
    return { proxyPart: line.trim(), comment: "" };
  }
  return {
    proxyPart: line.slice(0, idx).trim(),
    comment: line.slice(idx + 1).trim()
  };
}

function parseUriProxyLine(proxyPart, label) {
  let parsedUrl;
  try {
    parsedUrl = new URL(proxyPart);
  } catch {
    return null;
  }

  const scheme = parsedUrl.protocol.slice(0, -1).toLowerCase();
  if (!SUPPORTED_SCHEMES.has(scheme)) {
    return null;
  }

  const host = parsedUrl.hostname?.trim();
  const port = Number(parsedUrl.port);
  const pathname = parsedUrl.pathname || "";
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  if ((pathname && pathname !== "/") || parsedUrl.search || parsedUrl.hash) {
    return null;
  }

  const hasUsername = parsedUrl.username.length > 0;
  const hasPassword = parsedUrl.password.length > 0;
  if (hasUsername !== hasPassword) {
    return null;
  }

  if (scheme !== "http" && (hasUsername || hasPassword)) {
    return null;
  }

  return {
    scheme,
    host,
    port,
    username: hasUsername ? decodeURIComponent(parsedUrl.username) : undefined,
    password: hasPassword ? decodeURIComponent(parsedUrl.password) : undefined,
    label
  };
}

function parseProxyLine(line) {
  const label = line.trim();
  const { proxyPart } = splitComment(line);
  if (!proxyPart) {
    return null;
  }

  if (proxyPart.includes("://")) {
    return parseUriProxyLine(proxyPart, label);
  }

  const parts = proxyPart.split(":");
  if (parts.length !== 2 && parts.length !== 4) {
    return null;
  }

  const host = parts[0]?.trim();
  const port = Number(parts[1]);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  if (parts.length === 2) {
    return { scheme: "http", host, port, label };
  }

  const username = parts[2]?.trim();
  const password = parts[3]?.trim();
  if (!username || !password) {
    return null;
  }

  return { scheme: "http", host, port, username, password, label };
}

function normalizeMode(mode, activeProxy) {
  if (mode === "system" || mode === "direct" || mode === "proxy") {
    return mode;
  }

  if (activeProxy) {
    return "proxy";
  }

  return "direct";
}

async function getState() {
  const data = await chrome.storage.local.get(["proxies", "activeProxy", "connectionMode"]);
  const proxies = Array.isArray(data.proxies) ? data.proxies : DEFAULT_STATE.proxies;
  const activeProxy = typeof data.activeProxy === "string" ? data.activeProxy : DEFAULT_STATE.activeProxy;

  return {
    proxies,
    activeProxy,
    connectionMode: normalizeMode(data.connectionMode, activeProxy)
  };
}

async function applyCurrentProxy() {
  const { proxies, activeProxy, connectionMode } = await getState();

  if (connectionMode === "system") {
    currentAuth = null;
    await chrome.proxy.settings.clear({ scope: "regular" });
    return;
  }

  if (connectionMode === "direct") {
    currentAuth = null;
    await chrome.proxy.settings.set({
      value: { mode: "direct" },
      scope: "regular"
    });
    return;
  }

  if (!activeProxy || !proxies.includes(activeProxy)) {
    currentAuth = null;
    await chrome.proxy.settings.set({
      value: { mode: "direct" },
      scope: "regular"
    });
    return;
  }

  const parsed = parseProxyLine(activeProxy);
  if (!parsed) {
    currentAuth = null;
    await chrome.proxy.settings.set({
      value: { mode: "direct" },
      scope: "regular"
    });
    return;
  }

  currentAuth = parsed.username
    && parsed.scheme === "http"
    ? {
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password
      }
    : null;

  await chrome.proxy.settings.set({
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: parsed.scheme,
          host: parsed.host,
          port: parsed.port
        }
      }
    },
    scope: "regular"
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const data = await chrome.storage.local.get(["proxies", "activeProxy", "connectionMode"]);
  const updates = {};

  if (!Array.isArray(data.proxies)) {
    updates.proxies = [];
  }
  if (typeof data.activeProxy !== "string") {
    updates.activeProxy = null;
  }
  if (data.connectionMode !== "system" && data.connectionMode !== "direct" && data.connectionMode !== "proxy") {
    if (details.reason === "install") {
      updates.connectionMode = DEFAULT_STATE.connectionMode;
    } else {
      updates.connectionMode = normalizeMode(data.connectionMode, updates.activeProxy ?? data.activeProxy);
    }
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  await applyCurrentProxy();
});

chrome.runtime.onStartup.addListener(() => {
  applyCurrentProxy();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.proxies || changes.activeProxy || changes.connectionMode) {
    applyCurrentProxy();
  }
});

chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy || !currentAuth) {
      callback({});
      return;
    }

    const challenger = details.challenger || {};
    if (challenger.host !== currentAuth.host || Number(challenger.port) !== currentAuth.port) {
      callback({});
      return;
    }

    callback({
      authCredentials: {
        username: currentAuth.username,
        password: currentAuth.password
      }
    });
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);
