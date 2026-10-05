"""Extract PlanCompanies directly from XLSM; never execute VBA."""
import sys, json, re, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
rows=[]
with zipfile.ZipFile(sys.argv[1]) as z:
    strings=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)]
    for name in z.namelist():
        if not re.fullmatch(r'xl/worksheets/sheet\d+\.xml',name): continue
        root=ET.fromstring(z.read(name)); prop=root.find('m:sheetPr',ns)
        if prop is None or prop.get('codeName')!='PlanCompanies': continue
        for row in root.findall('m:sheetData/m:row',ns):
            if int(row.get('r'))<2: continue
            v={}
            for c in row:
                col=re.sub(r'\d','',c.get('r')); value=c.find('m:v',ns)
                if col not in ('A','B','C','D'): continue
                if value is not None and value.text is not None: v[col]=strings[int(value.text)] if c.get('t')=='s' else value.text
            if v.get('B'): rows.append(dict(matriz=v.get('A',''),sigla=v['B'].strip(),nome=v.get('C','').strip(),cor=v.get('D','')))
if len(rows)!=11: raise ValueError(f'Expected 11 companies, found {len(rows)}')
Path(sys.argv[2]).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(rows,ensure_ascii=True))
