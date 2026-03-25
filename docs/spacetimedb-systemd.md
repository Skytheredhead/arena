# SpacetimeDB `systemd` Service

This repo includes a ready-to-use unit file at [deploy/systemd/spacetimedb.service](/Users/skylarenns/Desktop/arena/deploy/systemd/spacetimedb.service) for the current server layout:

- user: `skylarenns`
- CLI path: `/home/skylarenns/.local/bin/spacetime`
- data dir: `/home/skylarenns/.local/share/spacetime/data`
- JWT key dir: `/home/skylarenns/.config/spacetime`
- listen addr: `0.0.0.0:4789`

## Install

Copy the unit into place:

```bash
sudo cp deploy/systemd/spacetimedb.service /etc/systemd/system/spacetimedb.service
```

Reload `systemd`:

```bash
sudo systemctl daemon-reload
```

If you still have a manually started SpacetimeDB process running, stop it first:

```bash
pkill -f spacetimedb-standalone
```

Enable the service on boot:

```bash
sudo systemctl enable spacetimedb
```

Start it now:

```bash
sudo systemctl start spacetimedb
```

Check status:

```bash
sudo systemctl status spacetimedb
```

Tail logs:

```bash
journalctl -u spacetimedb -f
```

## Upgrading later

Because the unit launches `/home/skylarenns/.local/bin/spacetime`, future CLI upgrades can keep using the same service:

```bash
spacetime version upgrade
sudo systemctl restart spacetimedb
```

Verify the running server path/version after restart:

```bash
ps aux | grep -i spacetimedb-standalone
spacetime --version
```
