const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const APP_URL = "https://something-gamer.web.app/";

// Mesma divisão do app Android: o SG roda dentro da janela, o login também,
// e qualquer outro endereço vai para o navegador do sistema.
const HOSTS_DO_APP = ["something-gamer.web.app", "something-gamer.firebaseapp.com"];
const HOSTS_DE_LOGIN = ["accounts.google.com", "steamcommunity.com", "us-central1-something-gamer.cloudfunctions.net"];

function hostDe(url) {
  try {
    const endereco = new URL(url);
    return endereco.protocol === "https:" ? endereco.hostname.toLowerCase() : "";
  } catch {
    return "";
  }
}

const ehDoApp = url => HOSTS_DO_APP.includes(hostDe(url));
const podeAbrirDentro = url => ehDoApp(url) || HOSTS_DE_LOGIN.includes(hostDe(url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#0b0d14",
    title: "Something Gamer",
    icon: path.join(__dirname, "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.loadURL(APP_URL);
  win.webContents.on("did-fail-load", () => setTimeout(() => win.loadURL(APP_URL), 2500));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (podeAbrirDentro(url)) {
      win.loadURL(url);
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Faltava: só window.open era filtrado. Um link comum, ou um redirecionamento,
  // levava a janela principal para qualquer site.
  win.webContents.on("will-navigate", (event, url) => {
    if (podeAbrirDentro(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  win.webContents.on("will-redirect", (event, url) => {
    if (podeAbrirDentro(url)) return;
    event.preventDefault();
  });

  // Microfone só para o SG (mensagem de voz), e só o microfone.
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const daPagina = webContents.getURL();
    callback(permission === "media" && ehDoApp(daPagina));
  });

  win.webContents.session.setPermissionCheckHandler((webContents, permission, origem) => {
    return permission === "media" && ehDoApp(origem || (webContents ? webContents.getURL() : ""));
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("web-contents-created", (event, contents) => {
  contents.on("will-attach-webview", (attachEvent, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
