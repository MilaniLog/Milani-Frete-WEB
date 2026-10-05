"""Export only registration sheets from XLSM XML, without running macros."""
import csv
import hashlib
import json
import re
import sys
import zipfile
from decimal import Decimal
from pathlib import Path
import xml.etree.ElementTree as ET

source, target = Path(sys.argv[1]), Path(sys.argv[2])
target.mkdir(parents=True, exist_ok=True)
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
sheets = {}
with zipfile.ZipFile(source) as archive:
    strings = [''.join(n.itertext()) for n in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    for name in archive.namelist():
        if not re.fullmatch(r'xl/worksheets/sheet\d+\.xml', name):
            continue
        root = ET.fromstring(archive.read(name))
        props = root.find('m:sheetPr', ns)
        code = props.get('codeName') if props is not None else ''
        if code not in ('PlanDriver', 'PlanVehicles', 'PlanTiposVeiculos', 'PlanCompanies'):
            continue
        rows = []
        for row in root.findall('m:sheetData/m:row', ns):
            values = {'row': int(row.get('r'))}
            for cell in row:
                col = re.sub(r'\d', '', cell.get('r'))
                v = cell.find('m:v', ns)
                if cell.get('t') == 'inlineStr':
                    values[col] = ''.join(cell.find('m:is', ns).itertext()).strip()
                elif v is not None and v.text is not None:
                    values[col] = (strings[int(v.text)] if cell.get('t') == 's' else v.text).strip()
            rows.append(values)
        sheets[code] = rows

issues = []
conflicting_records = []
def document(value, cpf=False):
    value = str(value).strip().lstrip("'")
    if re.fullmatch(r'\d+(\.0+)?([eE][+]?[0-9]+)?', value):
        value = format(Decimal(value), 'f').split('.')[0]
    else:
        value = re.sub(r'[.\-/\s]', '', value)
    if value.isdigit():
        value = value.zfill(11 if cpf or len(value) <= 11 else 14)
    return value

def unique(rows, key, entity):
    result = {}
    for row in rows:
        k = row[key]
        if k in result:
            if {a:b for a,b in row.items() if a != 'source_row'} != {a:b for a,b in result[k].items() if a != 'source_row'}:
                issues.append({'entity': entity, 'rows': [result[k]['source_row'], row['source_row']], 'reason': 'duplicate_conflict'})
                conflicting_records.append({'entity': entity, 'records': [result[k], row]})
        else:
            result[k] = row
    return list(result.values())

drivers = unique([{'source_row': r['row'], 'cpf': document(r.get('A', ''), True), 'name': r.get('B', '').strip()}
    for r in sheets['PlanDriver'] if r['row'] >= 6 and (r.get('A') or r.get('B'))], 'cpf', 'drivers')
vehicles = []
for r in sheets['PlanVehicles']:
    if r['row'] < 4 or not r.get('A'):
        continue
    canceled = r.get('K', '').upper()
    if canceled not in ('', '0', 'FALSE', 'FALSO', 'N', 'NAO', 'NÃO', '1', 'TRUE', 'VERDADEIRO', 'S', 'SIM', 'X'):
        issues.append({'entity': 'vehicles', 'row': r['row'], 'reason': 'unknown_cancel_flag', 'value': canceled})
    vehicles.append({'source_row': r['row'], 'plate': re.sub(r'[-\s]', '', r['A']).upper(),
        'type_code': r.get('C', ''), 'type_name': r.get('D', ''),
        'owner_name': r.get('E', '').strip(), 'owner': document(r.get('J', '')),
        'empresa_sigla': r.get('F', '').strip().upper(),
        'canceled': canceled in ('1', 'TRUE', 'VERDADEIRO', 'S', 'SIM', 'X')})
vehicles = unique(vehicles, 'plate', 'vehicles')
for d in drivers:
    if not re.fullmatch(r'\d{11}', d['cpf']) or not 4 <= len(d['name']) <= 50:
        issues.append({'entity': 'drivers', 'row': d['source_row'], 'reason': 'invalid_document_or_name'})
for v in vehicles:
    if not re.fullmatch(r'[A-Z]{3}[0-9][A-Z0-9][0-9]{2}', v['plate']):
        issues.append({'entity': 'vehicles', 'row': v['source_row'], 'reason': 'invalid_plate'})
    if not re.fullmatch(r'\d{11}|\d{14}', v['owner']) or not 2 <= len(v['owner_name']) <= 50:
        issues.append({'entity': 'vehicles', 'row': v['source_row'], 'reason': 'invalid_owner'})

export = {'source': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'drivers': drivers, 'vehicles': vehicles, 'issues': issues, 'conflicting_records': conflicting_records,
    'vehicle_types': [r for r in sheets['PlanTiposVeiculos'] if r['row'] >= 2 and r.get('A')],
    'companies': [r for r in sheets['PlanCompanies'] if r['row'] >= 2 and r.get('B')]}
(target / 'registrations.json').write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding='utf-8')
for name, rows in [('motoristas', drivers), ('veiculos', vehicles)]:
    with (target / (name + '.csv')).open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]), delimiter=';')
        writer.writeheader()
        writer.writerows(rows)
print(json.dumps({'drivers': len(drivers), 'vehicles': len(vehicles), 'canceled': sum(v['canceled'] for v in vehicles),
    'issues': issues, 'type_codes': sorted({v['type_code'] for v in vehicles}),
    'companies': sorted({v['empresa_sigla'] for v in vehicles})}, ensure_ascii=True))
