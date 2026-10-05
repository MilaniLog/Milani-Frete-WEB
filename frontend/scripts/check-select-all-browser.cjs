const { chromium } = require('playwright-core');
const ts = require('typescript');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<input id="name" value="Nome existente"><input id="amount" type="number" value="123.45" step="0.01"><textarea id="notes">Observacao existente</textarea><input id="date" type="date" value="2026-09-30"><input id="check" type="checkbox"><input id="readonly" readonly value="Preservar">`);
    const source = ts.transpileModule(fs.readFileSync('src/select-all-fields.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    await page.addScriptTag({ content: source.replaceAll('export function', 'function') + '\nwindow.removeSelection = installSelectAllFields(document);' });
    for (const [id, value] of [['name','Novo'], ['amount','50'], ['notes','Outra observacao']]) {
      await page.locator('#'+id).click();
      await page.keyboard.type(value);
      assert.equal(await page.locator('#'+id).inputValue(), value);
    }
    await page.locator('#amount').click();
    await page.keyboard.type('75');
    assert.equal(await page.locator('#amount').inputValue(), '75');
    await page.locator('#name').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.type('90');
    assert.equal(await page.locator('#amount').inputValue(), '90');
    await page.locator('#check').click();
    assert.equal(await page.locator('#check').isChecked(), true);
    assert.equal(await page.locator('#date').inputValue(), '2026-09-30');
    await page.locator('#readonly').click();
    await page.keyboard.type('x');
    assert.equal(await page.locator('#readonly').inputValue(), 'Preservar');
    await page.evaluate(() => { const field = document.createElement('input'); field.id='later';field.value='Existente';document.body.append(field); });
    await page.locator('#later').click();await page.keyboard.type('Novo');
    assert.equal(await page.locator('#later').inputValue(),'Novo');
    await page.evaluate(() => {
      const form=document.createElement('form'); form.id='entry';
      form.innerHTML='<input id="first" value="1212"><input readonly value="skip"><fieldset disabled><input></fieldset><input type="hidden"><input id="second" value="100"><textarea id="memo"></textarea><button>Salvar</button>';
      form.addEventListener('submit',e=>{e.preventDefault();window.submitted=true});document.body.append(form);
    });
    await page.locator('#first').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'second');
    await page.keyboard.type('50');assert.equal(await page.locator('#second').inputValue(),'50');
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'memo');
    await page.keyboard.type('Linha');await page.keyboard.press('Shift+Enter');await page.keyboard.type('Outra');
    assert.equal(await page.locator('#memo').inputValue(),'Linha\nOutra');
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BUTTON');
    assert.equal(await page.evaluate(()=>!!window.submitted),false);
    console.log('OK: texto, numero, textarea, clique repetido, Tab, campos dinamicos e controles preservados.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
