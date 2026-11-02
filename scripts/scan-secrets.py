"""Conservative offline check of staged files and all reachable Git blobs.

Never prints matching values. This detects known formats, not all possible
credentials; manual review and the no-push privacy gate remain necessary.
"""
import re
import subprocess
import sys

patterns = {
    'private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'),
    'github-token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b'),
    'google-oauth-token': re.compile(rb'\bya29\.[A-Za-z0-9_-]{30,}'),
    'aws-access-key': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'stripe-live-key': re.compile(rb'\bsk_live_[A-Za-z0-9]{16,}'),
    'mercadopago-token': re.compile(rb'\bAPP_USR-[0-9]{10,}-[A-Za-z0-9_-]{25,}'),
    'slack-token': re.compile(rb'\bxox[baprs]-[A-Za-z0-9-]{30,}'),
    'service-account-json': re.compile(rb'"type"\s*:\s*"service_account"'),
}

def git(*args):
    return subprocess.check_output(['git', *args])

def check(data, label):
    for kind, pattern in patterns.items():
        for match in pattern.finditer(data):
            line = data[:match.start()].count(b'\n') + 1
            findings.add((label, line, kind))

findings = set()
files = git('ls-files', '--cached', '-z').split(b'\0')
count = 0
for raw in files:
    if not raw:
        continue
    name = raw.decode()
    data = git('show', ':' + name)
    check(data, name)
    count += 1

objects = git('rev-list', '--objects', '--all').splitlines()
blobs = 0
for entry in objects:
    sha, _, path = entry.partition(b' ')
    if git('cat-file', '-t', sha.decode()).strip() != b'blob':
        continue
    check(git('cat-file', 'blob', sha.decode()), 'history:' + sha.decode() + ':' + path.decode(errors='replace'))
    blobs += 1

for label, line, kind in sorted(findings):
    print(f'{label}:{line}: {kind} [value redacted]')
print(f'{count} staged files; {blobs} historical blobs; {len(findings)} findings.')
if not count:
    print('No staged files: scan is not valid.', file=sys.stderr)
sys.exit(1 if findings or not count else 0)
