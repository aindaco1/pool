#!/usr/bin/env python3

import argparse
import json
import os
import shlex
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
WORKER_DIR = ROOT / 'worker'
SUPPORTS_REMOTE_FLAG = None
PROGRESS_WIDTH = 24


def parse_args():
    parser = argparse.ArgumentParser(description='Collect pledge records for report generation.')
    parser.add_argument('campaign_slug', nargs='?', default='')
    parser.add_argument('--env', choices=['dev', 'production'], default='production')
    parser.add_argument('--local', action='store_true')
    return parser.parse_args()


def get_platform_fulfiller():
    config_path = ROOT / '_config.yml'
    try:
        for raw_line in config_path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#'):
                continue
            if line.startswith('author:'):
                return line.split(':', 1)[1].strip().strip('"').strip("'")
    except Exception:
        return ''
    return ''


def resolve_wrangler_cmd():
    configured = os.environ.get('WRANGLER_BIN', '').strip()
    if configured:
        return shlex.split(configured)
    if shutil.which('wrangler'):
        return ['wrangler']
    return ['npx', 'wrangler']


def wrangler_supports_remote_flag():
    global SUPPORTS_REMOTE_FLAG
    if SUPPORTS_REMOTE_FLAG is not None:
        return SUPPORTS_REMOTE_FLAG
    if os.environ.get('MOCK_WRANGLER_DATA'):
        SUPPORTS_REMOTE_FLAG = False
        return SUPPORTS_REMOTE_FLAG

    result = subprocess.run(
        resolve_wrangler_cmd() + ['kv', 'key', 'list', '--help'],
        cwd=str(WORKER_DIR),
        capture_output=True,
        text=True,
        check=False
    )
    SUPPORTS_REMOTE_FLAG = '--remote' in f'{result.stdout}\n{result.stderr}'
    return SUPPORTS_REMOTE_FLAG


def wrangler_failure_message(output):
    wrangler_startup_failed = (
        'You installed workerd on another platform' in output
        or 'platform-specific binary executable' in output
        or 'worker/node_modules/workerd' in output
    )
    if (
        'CLOUDFLARE_API_TOKEN' in output
        or 'Not logged in' in output
        or 'Authentication error [code: 10000]' in output
        or wrangler_startup_failed
    ):
        podman_note = ''
        if os.environ.get('PODMAN_REPORT_INTERNAL') == '1':
            podman_note = (
                '\nThis report is running inside the Podman worker container. '
                'For reproducible remote production exports through Podman, '
                'use CLOUDFLARE_API_TOKEN rather than host Wrangler browser '
                'login. Put it in the host shell, .env.local, .env.cloudflare, '
                'or worker/.dev.vars before rerunning.\n'
            )
        return (
            'Remote report export could not authenticate with Wrangler.\n'
            'Either log in for this machine or provide a Cloudflare API token, '
            'then rerun the export:\n\n'
            '  cd worker && npx wrangler login\n\n'
            'or:\n\n'
            '  export CLOUDFLARE_API_TOKEN="your-token"\n'
            '  ./scripts/pledge-report.sh --env production --remote > '
            '~/Desktop/pool-pledge-report.csv\n'
            '  ./scripts/fulfillment-report.sh --env production --remote > '
            '~/Desktop/pool-fulfillment-report.csv\n\n'
            'For local Wrangler state instead, use --local.'
            f'{podman_note}'
            + (
                '\nWrangler could not start because the local workerd binary '
                'does not match this platform. Reinstall Worker dependencies '
                'with `cd worker && npm ci` if authentication is already configured.'
                if wrangler_startup_failed else ''
            )
        )
    return output or 'wrangler command failed'


def progress_enabled():
    return os.environ.get('POOL_REPORT_PROGRESS', '').strip() != '0'


def render_progress(current, total):
    ratio = current / total if total else 1
    filled = min(PROGRESS_WIDTH, max(0, round(PROGRESS_WIDTH * ratio)))
    return f"[{'#' * filled}{'.' * (PROGRESS_WIDTH - filled)}] {current}/{total}"


def report_progress(label, current, total, final=False):
    if not progress_enabled() or total <= 0:
        return

    message = f"{label}: {render_progress(current, total)}"
    if sys.stderr.isatty():
        print(f"\r{message}", end='\n' if final else '', file=sys.stderr, flush=True)
        return

    step = max(1, total // 10)
    if final or current == 1 or current % step == 0:
        print(message, file=sys.stderr, flush=True)


def run_wrangler_json(args):
    attempts = 3
    result = None
    output = ''
    for attempt in range(1, attempts + 1):
        result = subprocess.run(
            resolve_wrangler_cmd() + args,
            cwd=str(WORKER_DIR),
            capture_output=True,
            text=True,
            check=False
        )
        if result.returncode == 0:
            break

        output = result.stderr.strip() or result.stdout.strip()
        if 'fetch failed' not in output or attempt == attempts:
            break
        print(f"Wrangler fetch failed; retrying ({attempt + 1}/{attempts})...", file=sys.stderr)
        time.sleep(attempt)

    if result is not None and result.returncode != 0:
        message = wrangler_failure_message(output)
        if message != output:
            raise SystemExit(message)
        raise RuntimeError(message)
    output = result.stdout.strip()
    return json.loads(output) if output else None


def match_blob_dir(blob_dirs, blob_id):
    for blob_dir in blob_dirs:
        if (blob_dir / blob_id).exists():
            return blob_dir
    return None


def collect_local_pledges(campaign_slug):
    root = WORKER_DIR / '.wrangler' / 'state' / 'v3'
    db_paths = sorted((root / 'kv' / 'miniflare-KVNamespaceObject').glob('*.sqlite'))
    blob_dirs = sorted((root / 'kv').glob('*/blobs'))

    for db_path in db_paths:
        try:
            conn = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
        except Exception:
            continue

        rows = []
        blob_dir = None

        try:
            if campaign_slug:
                index_row = conn.execute(
                    'select blob_id from _mf_entries where key = ?',
                    (f'campaign-pledges:{campaign_slug}',)
                ).fetchone()
                if index_row:
                    blob_dir = match_blob_dir(blob_dirs, index_row[0])
                    if blob_dir is not None:
                        try:
                            order_ids = json.loads((blob_dir / index_row[0]).read_text())
                        except Exception:
                            order_ids = []
                        pledge_keys = [f'pledge:{order_id}' for order_id in (order_ids or [])]
                        if pledge_keys:
                            placeholders = ','.join('?' for _ in pledge_keys)
                            rows = conn.execute(
                                f'select key, blob_id from _mf_entries where key in ({placeholders})',
                                pledge_keys
                            ).fetchall()

            if not rows:
                rows = conn.execute("select key, blob_id from _mf_entries where key like 'pledge:%'").fetchall()
                if rows:
                    blob_dir = match_blob_dir(blob_dirs, rows[0][1])
        finally:
            conn.close()

        if not rows or blob_dir is None:
            continue

        pledges = []
        for _, blob_id in rows:
            blob_path = blob_dir / blob_id
            if not blob_path.exists():
                continue
            try:
                pledge = json.loads(blob_path.read_text())
            except Exception:
                continue
            if campaign_slug and pledge.get('campaignSlug') != campaign_slug:
                continue
            pledges.append(pledge)
        return pledges

    return []


def collect_remote_pledges(campaign_slug, env_name):
    wrangler_flags = []
    if wrangler_supports_remote_flag():
        wrangler_flags.append('--remote')
    if env_name == 'dev':
        wrangler_flags.extend(['--env', 'dev', '--preview'])

    pledge_keys = []
    if campaign_slug:
        try:
            index_data = run_wrangler_json([
                'kv', 'key', 'get', f'campaign-pledges:{campaign_slug}',
                '--binding', 'PLEDGES',
                *wrangler_flags
            ])
        except Exception:
            index_data = None
        if isinstance(index_data, list):
            pledge_keys = [f'pledge:{order_id}' for order_id in index_data]

    if not pledge_keys:
        key_list = run_wrangler_json([
            'kv', 'key', 'list',
            '--binding', 'PLEDGES',
            '--prefix', 'pledge:',
            *wrangler_flags
        ]) or []
        pledge_keys = [item.get('name', '') for item in key_list if item.get('name')]

    pledges = []
    total_keys = len(pledge_keys)
    if total_keys > 0:
        print(f'Found {total_keys} pledge keys. Fetching details...', file=sys.stderr)

    for index, key in enumerate(pledge_keys, start=1):
        pledge = run_wrangler_json([
            'kv', 'key', 'get', key,
            '--binding', 'PLEDGES',
            *wrangler_flags
        ])
        report_progress('Fetched pledge details', index, total_keys, final=index == total_keys)
        if not pledge:
            continue
        if campaign_slug and pledge.get('campaignSlug') != campaign_slug:
            continue
        pledges.append(pledge)

    return pledges


def main():
    args = parse_args()
    campaign_slug = args.campaign_slug.strip()
    platform_fulfiller = get_platform_fulfiller()

    if args.local:
        pledges = collect_local_pledges(campaign_slug)
    else:
        pledges = collect_remote_pledges(campaign_slug, args.env)

    print(f'Found {len(pledges)} pledges. Processing...', file=sys.stderr)
    json.dump(
        {
            'pledges': pledges,
            'campaignSlug': campaign_slug,
            'platformFulfiller': platform_fulfiller
        },
        sys.stdout
    )


if __name__ == '__main__':
    main()
