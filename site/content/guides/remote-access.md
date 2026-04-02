---
title: Access Your Board From Anywhere
summary: Serve your kanban board over your local network or Tailscale using Caddy.
weight: 10
---

This guide is for people comfortable with the command line. It shows how to serve your Jobs For Me kanban board as a local website using [Caddy](https://caddyserver.com), so you can access it from any device on your network — or anywhere, if you use [Tailscale](https://tailscale.com).

## Install Caddy

On macOS with Homebrew:

```sh
brew install caddy
```

See the [Caddy install docs](https://caddyserver.com/docs/install) for other platforms.

## Create a Caddyfile

In your Job Search directory (the same directory that contains your `Kanban/` folder), create a file called `Caddyfile`:

```caddy
:8080 {
	root * "/full/path/to/your/Job Search/Kanban"
	file_server
}
```

The `root` path must be a fully qualified absolute path — Caddy won't resolve it relative to the Caddyfile location.

## Start the server manually

```sh
caddy run --config '/full/path/to/your/Job Search/Caddyfile'
```

This can be run from any directory as long as the path to the Caddyfile is fully qualified. Your board is now at [http://localhost:8080](http://localhost:8080).

To stop the server, press `Ctrl+C` or run `caddy stop` from another terminal.

## Start Caddy automatically on login (macOS)

Create a LaunchAgent plist at `~/Library/LaunchAgents/com.jfm.caddy.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.jfm.caddy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/caddy</string>
        <string>run</string>
        <string>--config</string>
        <string>/full/path/to/your/Job Search/Caddyfile</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/jfm-caddy.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/jfm-caddy.log</string>
</dict>
</plist>
```

Update the path to your Caddyfile, then load it:

```sh
launchctl load ~/Library/LaunchAgents/com.jfm.caddy.plist
```

Caddy will now start automatically when you log in and restart if it crashes.

### Troubleshooting the LaunchAgent

Check if the service is running:

```sh
launchctl list | grep jfm
```

View logs:

```sh
cat /tmp/jfm-caddy.log
```

Stop the service:

```sh
launchctl unload ~/Library/LaunchAgents/com.jfm.caddy.plist
```

Remove it entirely:

```sh
launchctl unload ~/Library/LaunchAgents/com.jfm.caddy.plist
rm ~/Library/LaunchAgents/com.jfm.caddy.plist
```

## Access from other devices with Tailscale

If you run [Tailscale](https://tailscale.com), you can expose your Caddy server to your tailnet:

```sh
tailscale serve --bg 8080
```

This proxies your local Caddy server through Tailscale, making it available at `https://<your-machine-name>.<tailnet>.ts.net` from any device on your tailnet. The `--bg` flag runs it in the background, and Tailscale persists this configuration across reboots — no LaunchAgent needed.

Check status:

```sh
tailscale serve status
```

Stop serving:

```sh
tailscale serve --https=443 off
```

### Troubleshooting Tailscale

Can't reach the board from another device? Check these in order:

1. **Is Tailscale running on the other device?** This is the most common issue — make sure Tailscale is active on the device you're browsing from.
2. **Are both devices on the same tailnet?** Run `tailscale status` on your laptop to see connected devices.
3. **Is serve still configured?** Run `tailscale serve status` to confirm it's proxying port 8080.
4. **Is Caddy running?** Check `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/` — you should see `200`.
