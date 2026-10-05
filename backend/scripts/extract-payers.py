"""Read only payer columns used by VehicleUtils.GetVehicleData; no macros."""
import sys, json, zipfile, re
import xml.etree.ElementTree as ET
from pathlib import Path
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
rows = []
with zipfile.ZipFile(sys.argv[1]) as archive:
    strings = [''.join(n.itertext()) for n in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    for name in archive.namelist():
        if not re.fullmatch(r'xl/worksheets/sheet\d+\.xml', name): continue
        root = ET.fromstring(archive.read(name))
        props = root.find('m:sheetPr', ns)
        if props is None or props.get('codeName') != 'PlanVehicles': continue
        for row in root.findall('m:sheetData/m:row', ns):
            if int(row.get('r')) < 4: continue
            values = {}
            for cell in row:
                col = re.sub(r'\d', '', cell.get('r'))
                if col not in ('A', 'F', 'G', 'H', 'I'): continue
                v = cell.find('m:v', ns)
                if v is not None and v.text is not None:
                    values[col] = strings[int(v.text)] if cell.get('t') == 's' else v.text
            if values.get('A'):
                rows.append(dict(plate=values['A'].strip().upper(), first_payer=values.get('F','').strip(),
                    first_percent=values.get('G','0'), second_payer=values.get('H','').strip(), second_payer_percent=values.get('I','0')))
if not rows: raise ValueError('PlanVehicles missing or empty')
Path(sys.argv[2]).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'vehicles':len(rows),'payers':sorted({r[k] for r in rows for k in ('first_payer','second_payer') if r[k]}),'rates':sorted({(r['first_percent'],r['second_payer_percent']) for r in rows})},ensure_ascii=True))
