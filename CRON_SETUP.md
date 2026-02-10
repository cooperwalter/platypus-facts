# Cron Setup for Daily Platypus Facts

The daily send job runs as a cron task on the Raspberry Pi host, executing inside the running Docker container.

## Pi Setup (First Deploy)

Create the host directories Kamal will mount as volumes before the first deploy:

```bash
sudo mkdir -p /opt/platypus-facts/db /opt/platypus-facts/images
sudo chown -R $USER:$USER /opt/platypus-facts
```

These persist the SQLite database and AI-generated fact images across container replacements.

## Installing the Cron Job

The cron config is automatically installed by the GitHub Actions deploy workflow. On each deploy, the workflow SCPs `config/platypus-facts-cron` to the Pi and installs it at `/etc/cron.d/platypus-facts`. No manual setup is needed.

To install manually (e.g., first-time setup without a deploy):

```bash
scp config/platypus-facts-cron cooper@ssh.cooperwalter.dev:/tmp/
ssh cooper@ssh.cooperwalter.dev "sudo mv /tmp/platypus-facts-cron /etc/cron.d/platypus-facts && sudo chown root:root /etc/cron.d/platypus-facts && sudo chmod 644 /etc/cron.d/platypus-facts"
```

The cron config runs the daily send at 14:00 UTC. The container name includes a commit SHA on each deploy, so `docker ps -q --filter name=platypus-facts-web` is used to find the running container dynamically.

## Verifying the Cron Job

Check that the cron file is installed:

```bash
cat /etc/cron.d/platypus-facts
```

Test the job manually:

```bash
docker exec $(docker ps -q --filter name=platypus-facts-web) bun run src/jobs/daily-send.ts
```

Check recent logs:

```bash
tail -f /var/log/platypus-facts-cron.log
```

## Log Rotation

Add a logrotate configuration to prevent unbounded log growth:

```bash
cat > /etc/logrotate.d/platypus-facts << 'EOF'
/var/log/platypus-facts-cron.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
}
EOF
```

## Considerations

- `docker exec` requires the container to be running. If the container is stopped during a deploy, the cron job will fail silently for that run. The job is idempotent so this is safe -- it will succeed on the next run.
- The `DAILY_SEND_TIME_UTC` env var configures the intended send time. The crontab schedule must match this value.
