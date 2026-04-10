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

function parseProxyLine(line) {
  const { proxyPart } = splitComment(line);
  if (!proxyPart) {
    return null;
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
    return { host, port, label: line.trim() };
  }

  const username = parts[2]?.trim();
  const password = parts[3]?.trim();
  if (!username || !password) {
    return null;
  }

  return { host, port, username, password, label: line.trim() };
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
  const activeProxy = typeof data.activeProxy === "string" ? data.activeProxy : null;

  return {
    proxies: Array.isArray(data.proxies) ? data.proxies : [],
    activeProxy,
    connectionMode: normalizeMode(data.connectionMode, activeProxy)
  };
}

function createOption({ value, label, checked, name }) {
  const row = document.createElement("label");
  row.className = "radio-row";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;

  const span = document.createElement("span");
  span.textContent = label;

  row.append(input, span);
  return row;
}

async function render() {
  const form = document.getElementById("proxyForm");
  form.innerHTML = "";

  const { proxies, activeProxy, connectionMode } = await getState();
  const activeExists = connectionMode === "proxy" && activeProxy && proxies.includes(activeProxy);

  form.append(
    createOption({
      value: "__system__",
      label: t("useSystemProxy"),
      checked: connectionMode === "system",
      name: "proxy"
    }),
    createOption({
      value: "__disabled__",
      label: t("directConnection"),
      checked: connectionMode === "direct",
      name: "proxy"
    })
  );

  for (const line of proxies) {
    const parsed = parseProxyLine(line);
    if (!parsed) {
      continue;
    }

    form.append(
      createOption({
        value: line,
        label: parsed.label,
        checked: activeExists && activeProxy === line,
        name: "proxy"
      })
    );
  }
}

document.getElementById("proxyForm").addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.name !== "proxy") {
    return;
  }

  if (target.value === "__system__") {
    await chrome.storage.local.set({ connectionMode: "system", activeProxy: null });
    return;
  }

  if (target.value === "__disabled__") {
    await chrome.storage.local.set({ connectionMode: "direct", activeProxy: null });
    return;
  }

  await chrome.storage.local.set({ connectionMode: "proxy", activeProxy: target.value });
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  if (changes.proxies || changes.activeProxy || changes.connectionMode) {
    render();
  }
});
