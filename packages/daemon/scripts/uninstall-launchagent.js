#!/usr/bin/env node
/**
 * Nomad Daemon - macOS LaunchAgent Uninstaller
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

if (process.platform !== 'darwin') {
  console.log('[Nomad Daemon] LaunchAgent uninstallation is only applicable to macOS.');
  process.exit(0);
}

const homeDir = os.homedir();
const plistPath = path.join(homeDir, 'Library', 'LaunchAgents', 'com.nomad.daemon.plist');

try {
  if (fs.existsSync(plistPath)) {
    try {
      execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
    } catch {}
    fs.unlinkSync(plistPath);
    console.log(`[Nomad Daemon] Unregistered and removed LaunchAgent: ${plistPath}`);
  } else {
    console.log('[Nomad Daemon] No LaunchAgent found at: ' + plistPath);
  }
} catch (e) {
  console.error(
    '[Nomad Daemon] Failed to remove LaunchAgent:',
    e instanceof Error ? e.message : String(e),
  );
  process.exit(1);
}
