#!/usr/bin/env node
/**
 * Nomad Daemon - macOS LaunchAgent Installer
 * Configures com.nomad.daemon.plist in ~/Library/LaunchAgents
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

if (process.platform !== 'darwin') {
  console.log('[Nomad Daemon] LaunchAgent installation is only applicable to macOS.');
  process.exit(0);
}

const homeDir = os.homedir();
const launchAgentsDir = path.join(homeDir, 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgentsDir, 'com.nomad.daemon.plist');
const logsDir = path.join(homeDir, 'Library', 'Logs');

if (!fs.existsSync(launchAgentsDir)) {
  fs.mkdirSync(launchAgentsDir, { recursive: true });
}
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const nodePath = process.execPath;
const rootDir = path.resolve(__dirname, '../../..');
const daemonScript = path.join(rootDir, 'packages/daemon/bin/nomad-daemon.js');
const stdoutLog = path.join(logsDir, 'nomad-daemon.stdout.log');
const stderrLog = path.join(logsDir, 'nomad-daemon.stderr.log');

const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nomad.daemon</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${daemonScript}</string>
        <string>run</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${rootDir}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${stdoutLog}</string>
    <key>StandardErrorPath</key>
    <string>${stderrLog}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${process.env.PATH}</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
`;

try {
  // Unload previous if exists
  try {
    execSync(`launchctl unload "${plistPath}" 2>/dev/null`);
  } catch {}

  fs.writeFileSync(plistPath, plistContent, 'utf-8');
  console.log(`[Nomad Daemon] Created LaunchAgent at: ${plistPath}`);

  execSync(`launchctl load "${plistPath}"`);
  console.log('[Nomad Daemon] Successfully registered and started LaunchAgent (com.nomad.daemon)!');
  console.log(`[Nomad Daemon] Logs: ${stdoutLog}`);
} catch (e) {
  console.error('[Nomad Daemon] Failed to register LaunchAgent:', (e instanceof Error ? e.message : String(e)));
  process.exit(1);
}
