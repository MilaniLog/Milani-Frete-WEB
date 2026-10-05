"""Read cached XLSM values without Excel/macros; export anonymized financial evidence."""
import argparse
from collections import defaultdict
from datetime import datetime, timedelta
import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('workbook')
parser.add_argument('output')
parser.add_argument('--latest', type=int, help='Compare the latest N non-cancelled closures, including empty record categories.')
args = parser.parse_args()
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
sheets = {}
with zipfile.ZipFile(args.workbook) as archive:
    strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    rels = {node.attrib['Id']: node.attrib['Target'] for node in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
    for sheet in ET.fromstring(archive.read('xl/workbook.xml')).findall('m:sheets/m:sheet', ns):
        target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        root = ET.fromstring(archive.read(target.lstrip('/') if target.startswith('/') else 'xl/' + target))
        props = root.find('m:sheetPr', ns)
        if props is None:
            continue
        rows = []
        for row in root.findall('m:sheetData/m:row', ns):
            if int(row.attrib['r']) < 6:
                continue
            values = {'row': int(row.attrib['r'])}
            for cell in row:
                value = cell.find('m:v', ns)
                if value is not None and value.text is not None:
                    values[re.sub(r'\d', '', cell.attrib['r'])] = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
                elif cell.attrib.get('t') == 'inlineStr':
                    values[re.sub(r'\d', '', cell.attrib['r'])] = ''.join(cell.find('m:is', ns).itertext())
            rows.append(values)
        sheets[props.attrib.get('codeName')] = rows

def number(value):
    text = str(value or '0').strip()
    if ',' in text:
        text = text.replace('.', '').replace(',', '.')
    return Decimal(text)

closures = sheets['PlanFreightClosure']
manifests = next(rows for code, rows in sheets.items() if any('AS' in row and 'BD' in row for row in rows))
entries = sheets['PlanLaunch']
coupons = sheets['PlanCoupon']
candidates = []
def indexed(rows, column):
    result = defaultdict(list)
    for row in rows:
        if row.get(column):
            result[row[column]].append(row)
    return result

manifest_index = indexed(manifests, 'AS')
entry_index = indexed(entries, 'N')
coupon_index = indexed(coupons, 'M')
if args.latest is not None:
    if args.latest < 1:
        raise SystemExit('--latest must be positive')
    def recorded_date(row):
        value = str(row.get('P', '')).strip()
        try:
            return (datetime(1899, 12, 30) + timedelta(days=float(value))).isoformat()
        except ValueError:
            for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d/%m/%Y %H:%M:%S'):
                try:
                    return datetime.strptime(value, fmt).isoformat()
                except ValueError:
                    pass
        raise ValueError(f"Missing/invalid closure date at row {row['row']}")
    active = [row for row in closures if row.get('A') and row.get('I') not in ('1', 'True', 'TRUE')]
    dated, undated = [], []
    for row in active:
        try:
            dated.append((recorded_date(row), row))
        except ValueError:
            undated.append(row['row'])
    dated.sort(key=lambda item: (item[0], number(item[1]['A']), item[1]['row']), reverse=True)
    cases = []
    for recorded, row in dated[:args.latest]:
        identity = row['A']
        ms, es, cs = manifest_index[identity], entry_index[identity], coupon_index[identity]
        gross = sum((number(r.get('U')) for r in ms), Decimal(0)) + sum((number(r.get('J')) for r in es if r.get('H') == 'Credito'), Decimal(0))
        debit = sum((number(r.get('J')) for r in es if r.get('H') == 'Debito'), Decimal(0)) + sum((number(r.get('J')) for r in cs), Decimal(0))
        if row.get('H') is None:
            raise ValueError(f"Missing stored net at row {row['row']}")
        cases.append({
            'source_row': row['row'], 'recorded_date': recorded, 'closure_number': identity,
            'expected': {'total_liquido': str(number(row['H'])), 'total_bruto': str(number(row['T'])) if row.get('T') else None, 'total_debitos': str(number(row['S'])) if row.get('S') else None},
            'manifests': [{'id': i+1, 'frete_veiculo': str(number(r.get('U'))), 'ctrb_total': str(number(r.get('BD'))), 'ctrb_numero': 'CTRB-ANONIMIZADO' if r.get('AZ', '').strip() else None} for i, r in enumerate(ms)],
            'entries': [{'id': i+1, 'tipo_despesa': r.get('H'), 'valor': str(number(r.get('J')))} for i, r in enumerate(es)],
            'coupons': [{'id': i+1, 'valor': str(number(r.get('J')))} for i, r in enumerate(cs)],
            'calculated_from_cached_rows': {'total_bruto': str(gross), 'total_debitos': str(debit), 'total_liquido': str(gross-debit)},
        })
    payload = {'source_sha256': hashlib.sha256(Path(args.workbook).read_bytes()).hexdigest(), 'selection': 'date column P descending, closure number descending for ties; non-cancelled, no category filter', 'requested_count': args.latest, 'undated_rows': undated, 'cases': cases}
    Path(args.output).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf8')
    print(json.dumps({'undated_rows': undated, 'cases': [{k: v for k, v in case.items() if k not in ('manifests', 'entries', 'coupons')} | {'counts': [len(case[k]) for k in ('manifests', 'entries', 'coupons')]} for case in cases]}, indent=2))
    raise SystemExit(0)
for closure in closures:
    identity = closure.get('A')
    if not identity or closure.get('I') in ('1', 'True', 'TRUE'):
        continue
    ms = manifest_index[identity]
    es = entry_index[identity]
    cs = coupon_index[identity]
    if not ms or not es or not cs:
        continue
    try:
        gross = sum((number(row.get('U')) for row in ms), Decimal(0)) + sum((number(row.get('J')) for row in es if row.get('H') == 'Credito'), Decimal(0))
        debit = sum((number(row.get('J')) for row in es if row.get('H') == 'Debito'), Decimal(0)) + sum((number(row.get('J')) for row in cs), Decimal(0))
        expected = number(closure.get('H'))
        candidates.append((closure, ms, es, cs, gross, debit, expected))
    except Exception:
        continue
if not candidates:
    raise SystemExit('No non-cancelled closure with all three record types found.')
# Select latest complete candidate independently of whether its totals match.
closure, ms, es, cs, gross, debit, expected = max(candidates, key=lambda item: item[0]['row'])
payload = {
    'source_sha256': hashlib.sha256(Path(args.workbook).read_bytes()).hexdigest(),
    'source_row': closure['row'],
    'candidate_count': len(candidates),
    'aggregate_matches': sum(abs(g-d-e) < Decimal('.005') for _, _, _, _, g, d, e in candidates),
    'differences': [{'source_row': c['row'], 'stored_net': str(e), 'reconstructed_net': str(g-d), 'difference': str(g-d-e), 'manifest_count': len(m), 'entry_count': len(l), 'coupon_count': len(q)} for c, m, l, q, g, d, e in candidates if abs(g-d-e) >= Decimal('.005')],
    'expected': {'total_liquido': str(expected), 'total_bruto': closure.get('T'), 'total_debitos': closure.get('S')},
    'manifests': [{'id': i+1, 'frete_veiculo': str(number(row.get('U'))), 'ctrb_total': str(number(row.get('BD'))), 'ctrb_numero': 'CTRB-ANONIMIZADO' if row.get('AZ', '').strip() else None} for i, row in enumerate(ms)],
    'entries': [{'id': i+1, 'tipo_despesa': row.get('H'), 'valor': row.get('J', '0')} for i, row in enumerate(es)],
    'coupons': [{'id': i+1, 'valor': row.get('J', '0')} for i, row in enumerate(cs)],
    'calculated_from_cached_rows': {'total_bruto': str(gross), 'total_debitos': str(debit), 'total_liquido': str(gross-debit)},
}
Path(args.output).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf8')
for c, m, l, q, g, d, e in candidates:
    if abs(g-d-e) >= Decimal('.005'):
        print('Difference evidence:', json.dumps({'row': c['row'], 'stored_gross': c.get('T'), 'stored_debits': c.get('S'), 'gross': str(g), 'debits': str(d), 'manifests': [{'row': r['row'], 'freight': r.get('U')} for r in m], 'entries': [{'row': r['row'], 'type': r.get('H'), 'value': r.get('J')} for r in l], 'coupons': [{'row': r['row'], 'value': r.get('J')} for r in q]}))
print(json.dumps({key: value for key, value in payload.items() if key not in ('manifests', 'entries', 'coupons')}, indent=2))
print('Records:', len(ms), len(es), len(cs))
