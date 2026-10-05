import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [], writes = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace('/api', '');
    let body = [];
    if (path === '/auth/login') body = { accessToken: 'test', user: { id: 1, cod: 2, name: 'Operador', unit: 100, isAdmin: false }, permissions: [] };
    else if (path === '/registrations/vehicles') body = [{ plate: 'ABC1234', driver_cpf:'52998224725', driver_name:'Motorista teste' }, { plate: 'DEF5678' }];
    else if (path === '/drivers') body = [{ cpf: '52998224725', name: 'Motorista teste' }, {cpf:'00123456789',name:'Motorista alternativo'}];
    else if (path === '/destinations') body = [{ id: 1, nome: 'São Paulo' }];
    else if (path === '/manifests/preview') {
      const p = req.postDataJSON(), f = p.frete_veiculo ?? (p.placa === 'ABC1234' ? 250 : 300);
      const total = p.cod_777_00 * .93 + p.cod_888_00 * .88 + p.cod_999_00 * .88;
      body = { frete_veiculo: f, despesas_empresa: 0, totalFretes: total, totalReceive: total, discounts: 0,
        freightVehicle: f, initPercent: total ? f / total : 0, finalPercent: total ? f / total : 0,
        freightsCalculated: { freight777: p.cod_777_00 * .93, freight888: p.cod_888_00 * .88,
          freight999: p.cod_999_00 * .88, notDelivery777: 0, notDelivery888: 0, notDelivery999: 0 },
        vehicle: { type: 'VAN', max_m3: 10, max_weight: 1000 } };
    } else if (req.method() !== 'GET') writes.push(path);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Código do usuário').fill('2');
  await page.getByLabel('Senha', { exact: true }).fill('teste');
  await page.getByRole('button', { name: 'Entrar →' }).click();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Manifestos', exact: true }).click();
  const field = name => page.getByLabel(name, { exact: true });
  const help = page.getByRole('button', { name: 'Ajuda: CTRB', exact: true });
  assert.equal(await page.getByRole('tooltip').count(), 0);
  await help.hover();
  await page.getByRole('tooltip').waitFor();
  await page.getByRole('heading', {name:'Manifestos', exact:true}).hover();
  assert.equal(await page.getByRole('tooltip').count(), 0);
  await help.click();
  await page.getByRole('tooltip').waitFor();
  await help.press('Escape');
  assert.equal(await page.getByRole('tooltip').count(), 0);
  assert.equal(await page.locator('[name="romaneio"]').count(),0);
  await field('Primeiros três dígitos do manifesto').fill('850');
  await field('Número do manifesto').fill('3182');
  await field('Número do manifesto').press('Tab');
  assert.equal(await field('Número do manifesto').inputValue(),'000318-2');
  assert.equal(await page.locator('[name=manifestos]').inputValue(),'850000318-2');
  await field('Hora').fill('1212'); await field('Hora').press('Tab');
  assert.equal(await field('Hora').inputValue(),'12:12');
  for (const value of ['121226','12122026']) {
    await field('Data do carregamento').fill(value); await field('Data do carregamento').press('Tab');
    assert.equal(await field('Data do carregamento').inputValue(),'12/12/2026');
  }
  await field('Placa').fill('ABC');
  const plateWidth = (await field('Placa').boundingBox()).width;
  await field('Placa').press('Enter');
  assert.equal(await field('Motorista').evaluate(el => el === document.activeElement), true);
  await page.waitForFunction(() => document.querySelector('[aria-label=Motorista]')?.value === 'Motorista teste');
  assert.equal((await field('Placa').boundingBox()).width, plateWidth);
  assert.equal(await field('Motorista').isEnabled(),true);
  await field('Motorista').fill('alternativo');
  await page.getByRole('option', {name:'Motorista alternativo',exact:true}).click();
  await field('Destino').fill('sao');
  await page.getByRole('option', {name:'São Paulo',exact:true}).click();
  assert.equal(await page.locator('[name=cpf_motorista]').inputValue(),'00123456789');
  assert.equal(await page.locator('[name=destino_id]').inputValue(),'1');
  await field('Frete 777').fill('1000');
  await page.waitForFunction(() => document.querySelector('[name="frete_veiculo"]')?.value === '250');
  await field('Placa').fill('DEF');
  await field('Placa').press('ArrowDown');
  await field('Placa').press('Enter');
  assert.equal(await field('Motorista').evaluate(el => el === document.activeElement), true);
  await page.waitForFunction(() => document.querySelector('[name="frete_veiculo"]')?.value === '300');
  assert.equal(await field('Motorista').inputValue(),'');
  await field('Frete do veículo').fill('333');
  await field('Placa').fill('ABC');
  await page.getByRole('option', {name:'ABC1234',exact:true}).click();
  await field('Volume (m³)').fill('11');
  await page.getByText(/A cubagem permitida/).waitFor();
  assert.equal(await field('Frete do veículo').inputValue(), '333');
  for (const [label, value] of Object.entries({ 'CTRB total': '1000', 'Adiantamento CTRB': '200', 'SEST/SENAT': '10', 'IRRF': '20', 'Previdência social': '30', 'INSS': '40', 'Vale-pedágio': '500' })) await field(label).fill(value);
  assert.match(await field('Valor líquido').inputValue(), /700,00/);
  assert.match(await field('Total de retenções').inputValue(), /100,00/);
  await field('Percentual final').waitFor();
  await mkdir('artifacts/manifest-calculation', { recursive: true });
  await page.screenshot({ path: 'artifacts/manifest-calculation/formulario.png', fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log('CTRB, frete automático/manual, troca de placa e avisos aprovados no Edge com API simulada.');
} finally { await browser.close(); }
