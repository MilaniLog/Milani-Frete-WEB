"""Extract the VBA expense catalog from XLSM XML without executing macros."""
import sys, json, zipfile, re
import xml.etree.ElementTree as ET
from pathlib import Path

ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
result = {}
with zipfile.ZipFile(sys.argv[1]) as archive:
    strings = [''.join(n.itertext()) for n in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    for name in archive.namelist():
        if not re.fullmatch(r'xl/worksheets/sheet\d+\.xml', name):
            continue
        root = ET.fromstring(archive.read(name))
        props = root.find('m:sheetPr', ns)
        code = props.get('codeName') if props is not None else None
        if code not in ('PlanExpense', 'PlanRestrict'):
            continue
        values = {}
        for cell in root.findall('m:sheetData/m:row/m:c', ns):
            v = cell.find('m:v', ns)
            if v is not None and v.text is not None:
                values[cell.get('r')] = strings[int(v.text)] if cell.get('t') == 's' else v.text
        if code == 'PlanRestrict':
            result['unit'] = int(values['E2'])
        else:
            result['expenses'] = [dict(codigo=values['A'+r].strip(), nome=values.get('B'+r, '').strip(), tipo=values.get('C'+r, '').strip(), ativo=True)
                for r in sorted({k[1:] for k in values if k.startswith('A') and int(k[1:]) >= 6}, key=int)]
if not result.get('unit') or not result.get('expenses'):
    raise ValueError('Missing source unit or expense catalog')
Path(sys.argv[2]).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
