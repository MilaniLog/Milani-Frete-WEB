import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const writes = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let body = [];
    if (path.endsWith('/auth/login')) body = { accessToken: 'test', user: { cod: 2, name: 'Teste', unit: 100, isAdmin: false }, permissions: [] };
    else if (path.endsWith('/companies')) body = [{ sigla: 'EX', nome: 'Exemplo', matriz: '100' }];
    else if (path.endsWith('/vehicle-types')) body = [{ codVehicleType: 1, typeName: 'VAN' }];
    else if (path.endsWith('/drivers')) body = [{ cpf: '52998224725', name: 'Proprietário teste' }];
    else if (request.method() === 'POST') { writes.push(request.postDataJSON()); body = {}; }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Código do usuário').fill('2');
  await page.getByLabel('Senha', {exact:true}).fill('teste');
  await page.getByRole('button', {name:'Entrar →'}).click();
  await page.getByRole('button', {name:'Menu',exact:true}).click();
  await page.getByRole('button', {name:'Veículos',exact:true}).click();
  await page.getByRole('button', {name:'+ Novo veículo'}).click();
  await page.getByLabel('Placa', {exact:true}).fill('abc-1234');
  assert.equal(await page.getByLabel('Placa', {exact:true}).inputValue(), 'ABC1234');
  await page.getByLabel('Tipo de veículo', {exact:true}).selectOption('1');
  await page.getByLabel('Proprietário', {exact:true}).fill('Proprietário teste');
  const document = page.getByLabel('CPF/CNPJ do proprietário', {exact:true});
  await document.fill('11.222.333/0001-81');
  assert.equal(await document.inputValue(), '11.222.333/0001-81');
  await document.fill('00123456789');
  assert.equal(await document.inputValue(), '001.234.567-89');
  await document.evaluate(el => el.setSelectionRange(4, 4));
  await document.press('Backspace');
  assert.equal((await document.inputValue()).replace(/\D/g, ''), '0023456789');
  await document.fill('529.982.247-25');
  await page.getByLabel('Empresa', {exact:true}).selectOption('EX');
  await page.getByRole('checkbox', {name:'O proprietário é o motorista?'}).check();
  await page.getByRole('button', {name:'Salvar cadastro'}).click();
  await page.getByText('Cadastro salvo com sucesso.').waitFor();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].owner, '52998224725');
  assert.equal(writes[0].driver_cpf, '52998224725');
  assert.equal(writes[0].owner_is_driver, true);
  console.log('Máscaras, edição no meio do CPF, placa e envio sem pontuação aprovados com API simulada.');
} finally { await browser.close(); }
