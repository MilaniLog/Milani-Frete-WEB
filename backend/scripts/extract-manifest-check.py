"""Read the five last appended manifests; never execute macros or write the workbook."""
import sys, json, zipfile, re, hashlib
from pathlib import Path
from datetime import datetime, timedelta
import xml.etree.ElementTree as E

source, output = map(Path, sys.argv[1:3])
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
sheets = {}
with zipfile.ZipFile(source) as z:
    strings = [''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    rels = {x.attrib['Id']: x.attrib['Target'] for x in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    for sh in E.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet', ns):
        if sh.attrib['name'] not in ['Manifestos', 'ICMS']: continue
        t = rels[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        root = E.fromstring(z.read(t.lstrip('/') if t.startswith('/') else 'xl/' + t))
        rows = []
        for row in root.findall('m:sheetData/m:row', ns):
            d = {'row': int(row.attrib['r'])}
            for c in row:
                v = c.find('m:v', ns)
                if v is not None and v.text:
                    d[re.sub(r'\d', '', c.attrib['r'])] = strings[int(v.text)] if c.attrib.get('t') == 's' else v.text
            rows.append(d)
        sheets[sh.attrib['name']] = rows

def num(v):
    s = str(v or '0').strip()
    return float(s.replace('.', '').replace(',', '.') if ',' in s else s)

inputs = dict(cod_777_00='M', cod_888_00='N', cod_999_00='O', nao_777='AB', nao_888='AC', nao_999='AD', frete_veiculo='U', outros='AI', diaria='AJ', tde='AK', escada='AL', paletizacao='AM', estadia='AV', descarga='BA')
expected = dict(freight777='P', freight888='Q', freight999='R', notDelivery777='AE', notDelivery888='AF', notDelivery999='AG', totalFretes='T', discounts='AH', totalPay='Y', initPercent='Z', finalPercent='AQ', legacyNet='AP')
cases = []
for r in [r for r in sheets['Manifestos'] if r['row'] >= 6 and r.get('B')][-5:]:
    data = {k: num(r.get(c)) for k, c in inputs.items()}
    # The cached expense summary W is the amount included alongside vehicle freight.
    data['despesas_empresa'] = sum(num(v) for v in re.split(r'_x000D_|[\r\n]+', r.get('W', '')) if v.strip())
    cases.append({'row': r['row'], 'manifest': r['B'], 'date': (datetime(1899,12,30)+timedelta(days=num(r['A']))).date().isoformat(), 'input': data, 'expected': {k:num(r[c]) for k,c in expected.items() if r.get(c) is not None}, 'ctrb': {c:num(r.get(c)) for c in ['BD','BE','BF','BG','BH','BI','BJ','BK','BL']}})
rules = [{'codigo_frete': num(r['B']), 'aliquota': str(num(r['C'])), 'percentual': str(num(r['D']))} for r in sheets['ICMS'] if r['row'] in [6,7,8]]
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'sha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'selection':'Last five appended rows in Manifestos, not sorted by editable AW timestamp', 'rules':rules,'cases':cases}, indent=2), encoding='utf-8')
print(json.dumps({'output':str(output),'rows':[c['row'] for c in cases], 'rules':rules}))
