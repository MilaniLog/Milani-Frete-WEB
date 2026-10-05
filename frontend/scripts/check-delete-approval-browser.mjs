import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  const page = await browser.newPage(); let deleted=false, attempts=0;
  await page.route('**/api/**',async route=>{
    const req=route.request(), path=new URL(req.url()).pathname; let body=[],status=200;
    if(path.endsWith('/auth/login')) body={accessToken:'operator',user:{id:1,cod:2,name:'Operador',unit:100,isAdmin:false},permissions:[]};
    else if(req.method()==='DELETE') {
      attempts++; const auth=req.postDataJSON()?.admin_authorization;
      if(auth?.cod==='8'&&auth?.password==='test-approval') {deleted=true;body={};}
      else {status=403;body={code:'ADMIN_APPROVAL_REQUIRED',message:'Autorize a exclusão.'};}
    }
    else if(path.endsWith('/vehicles')) body=deleted?[]:[{plate:'ABC1234',owner:'52998224725',owner_name:'Motorista teste',codVehicleType:1,empresa_sigla:'EX'}];
    else if(path.endsWith('/drivers')) body=[{cpf:'52998224725',name:'Motorista teste'}];
    else if(path.endsWith('/companies')) body=[{sigla:'EX',nome:'Empresa',matriz:'100'}];
    else if(path.endsWith('/vehicle-types')) body=[{codVehicleType:1,typeName:'VAN'}];
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5173');
  await page.getByLabel('Código do usuário').fill('2');await page.getByLabel('Senha',{exact:true}).fill('test');
  await page.getByRole('button',{name:'Entrar →'}).click();
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Veículos',exact:true}).click();
  await page.getByRole('button',{name:'Editar ABC1234'}).click();
  await page.getByRole('checkbox',{name:'O proprietário é o motorista?'}).check();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Motorista do veículo"]')?.value==='Motorista teste');
  await page.getByRole('button',{name:'Excluir veículo',exact:true}).click();await page.getByRole('button',{name:'Confirmar exclusão'}).click();
  await page.getByRole('dialog').waitFor();assert.equal(deleted,false);
  await page.getByLabel('Código do administrador').fill('8');await page.getByLabel('Senha do administrador').fill('test-approval');
  await page.getByRole('button',{name:'Autorizar e excluir'}).click();
  await page.getByText('Nenhum cadastro encontrado.').waitFor();
  assert.equal(deleted,true);assert.equal(attempts,2);assert.equal(await page.getByRole('dialog').count(),0);
  console.log('Busca do proprietário e exclusão com autorização aprovadas no navegador; API simulada.');
} finally {await browser.close();}
