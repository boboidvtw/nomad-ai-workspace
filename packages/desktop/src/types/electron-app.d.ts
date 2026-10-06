// main.js and tray.js share a quit flag on the Electron app object.
declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}

export {};
