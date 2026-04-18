#!/usr/bin/env python3
import json
import sys

try:
    with open('zap-report.json') as f:
        data = json.load(f)
except FileNotFoundError:
    print('zap-report.json not found — skipping')
    sys.exit(0)

high   = sum(1 for s in data.get('site', []) for a in s.get('alerts', []) if a['riskcode'] == '3')
medium = sum(1 for s in data.get('site', []) for a in s.get('alerts', []) if a['riskcode'] == '2')
low    = sum(1 for s in data.get('site', []) for a in s.get('alerts', []) if a['riskcode'] == '1')

summary = {'high': high, 'medium': medium, 'low': low}
with open('zap-summary.json', 'w') as f:
    json.dump(summary, f)

print(f'High: {high}  Medium: {medium}  Low: {low}')

if high > 0:
    print('HIGH severity findings — review required before release')
    sys.exit(1)
else:
    print('No HIGH severity findings')
