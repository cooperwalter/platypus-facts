# Cron Setup for Daily Platypus Facts

The daily send job runs as a cron task on the VPS host, executing inside the Docker container.

## VPS Setup (First Deploy)

Create the host directories Kamal will mount as volumes before the first deploy:

```bash
sudo mkdir -p /opt/platypus-facts/data /opt/platypus-facts/images
```

These persist the SQLite database and AI-generated fact images across container replacements.

## Installing the Crontab

SSH into the VPS and edit the crontab:

```bash
crontab -e
```

Add the following entry (sends at 14:00 UTC daily):

```
0 14 * * * docker exec platypus-facts-web bun run src/jobs/daily-send.ts >> /var/log/platypus-facts-cron.log 2>&1
```

The container name `platypus-facts-web` matches the Kamal service name with the `-web` suffix.

## Verifying the Cron Job

Check that the crontab is installed:

```bash
crontab -l
```

Test the job manually:

```bash
docker exec platypus-facts-web bun run src/jobs/daily-send.ts
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
- For a more robust approach, consider in-container scheduling (e.g., supercronic) as a post-launch improvement.
