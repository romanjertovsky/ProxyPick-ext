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

function validateUriProxyLine(proxyPart) {
  let parsedUrl;
  try {
    parsedUrl = new URL(proxyPart);
  } catch {
    return false;
  }

  const scheme = parsedUrl.protocol.slice(0, -1).toLowerCase();
  if (!["http", "socks4", "socks5"].includes(scheme)) {
    return false;
  }

  const host = parsedUrl.hostname?.trim();
  const port = Number(parsedUrl.port);
  const pathname = parsedUrl.pathname || "";
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return false;
  }

  if ((pathname && pathname !== "/") || parsedUrl.search || parsedUrl.hash) {
    return false;
  }

  const hasUsername = parsedUrl.username.length > 0;
  const hasPassword = parsedUrl.password.length > 0;
  if (hasUsername !== hasPassword) {
    return false;
  }

  if (scheme !== "http" && (hasUsername || hasPassword)) {
    return false;
  }

  return true;
}

function validateProxyLine(line) {
  const { proxyPart } = splitComment(line);
  if (!proxyPart) {
    return false;
  }

  if (proxyPart.includes("://")) {
    return validateUriProxyLine(proxyPart);
  }

  const parts = proxyPart.split(":");
  if (parts.length !== 2 && parts.length !== 4) {
    return false;
  }

  const host = parts[0]?.trim();
  const port = Number(parts[1]);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return false;
  }

  if (parts.length === 2) {
    return true;
  }

  const username = parts[2]?.trim();
  const password = parts[3]?.trim();
  return Boolean(username && password);
}

function setStatus(text, isError = false) {
  const status = document.getElementById("status");
  status.textContent = text;
  status.className = isError ? "status error" : "status ok";
}

async function loadList() {
  const data = await chrome.storage.local.get(["proxies"]);
  const proxies = Array.isArray(data.proxies) ? data.proxies : [];
  document.getElementById("proxyList").value = proxies.join("\n");
}

async function saveList() {
  const textarea = document.getElementById("proxyList");
  const rawLines = textarea.value.split(/\r?\n/);

  const cleaned = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i].trim();
    if (!line) {
      continue;
    }

    if (!validateProxyLine(line)) {
      setStatus(t("invalidFormatLine", String(i + 1)), true);
      return;
    }

    cleaned.push(line);
  }

  const data = await chrome.storage.local.get(["activeProxy"]);
  const activeProxy = typeof data.activeProxy === "string" ? data.activeProxy : null;
  const nextActiveProxy = activeProxy && cleaned.includes(activeProxy) ? activeProxy : null;

  await chrome.storage.local.set({
    proxies: cleaned,
    activeProxy: nextActiveProxy
  });

  setStatus(t("savedStatus"));
}

document.getElementById("saveButton").addEventListener("click", saveList);
loadList();
