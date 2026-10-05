"""Read VBA designer metadata without running macros or saving the workbook."""
import json
import sys
from pathlib import Path
import win32com.client

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
excel = win32com.client.DispatchEx('Excel.Application')
book = None
try:
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.EnableEvents = False
    excel.AutomationSecurity = 3  # msoAutomationSecurityForceDisable
    book = excel.Workbooks.Open(str(source), UpdateLinks=0, ReadOnly=True)
    forms = []

    def controls(parent):
        result = []
        for control in parent.Controls:
            item = {}
            for key in ['Name', 'Caption', 'Left', 'Top', 'Width', 'Height', 'TabIndex']:
                try:
                    item[key] = getattr(control, key)
                except Exception:
                    pass
            try:
                item['controls'] = controls(control)
            except Exception:
                pass
            result.append(item)
        return result

    for component in book.VBProject.VBComponents:
        if component.Type == 3:
            designer = component.Designer
            forms.append({
                'name': component.Name,
                'caption': designer.Caption,
                'width': component.Properties('Width').Value,
                'height': component.Properties('Height').Value,
                'controls': controls(designer),
            })
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(forms, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Extracted designer metadata for {len(forms)} forms.')
finally:
    if book is not None:
        book.Close(SaveChanges=False)
    excel.Quit()
