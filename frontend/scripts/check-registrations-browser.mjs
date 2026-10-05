import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let drivers=[],vehicles=[],writes=[];
 const companies=[{sigla:'AZN',nome:'AZN',matriz:'500',cor:''}];
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  let body=[];
  if(path.endsWith('/auth/login'))body={accessToken:'test',user:{id:1,cod:1,name:'Admin teste',unit:100,isAdmin:true},permissions:[]};
  else if(req.method()==='POST'||req.method()==='PUT'){
   body=req.postDataJSON();writes.push(body);
   if(path.includes('drivers'))drivers=[body];else vehicles=[body];
  } else if(path.endsWith('/companies'))body=companies;
  else if(path.endsWith('/vehicle-types'))body=[{codVehicleType:1,typeName:'Truck'}];
  else if(path.endsWith('/drivers'))body=drivers;
  else if(path.endsWith('/vehicles'))body=vehicles;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(process.env.FRONTEND_URL||'http://127.0.0.1:5173');
 await page.getByLabel('Código do usuário').fill('1');await page.getByLabel('Senha',{exact:true}).fill('test');await page.getByRole('button',{name:'Entrar →'}).click();
 async function nav(name){await page.getByRole('button',{name:/^Menu/}).click();await page.getByRole('button',{name,exact:true}).click();}
 await nav('Empresas');await page.getByRole('cell',{name:'AZN',exact:true}).first().waitFor();
 await nav('Motoristas');await page.getByRole('button',{name:'+ Novo motorista'}).click();
 await page.getByLabel('CPF',{exact:true}).fill('52998224725');await page.getByLabel('Nome',{exact:true}).fill('João teste');
 assert.equal(await page.getByLabel('Empresa',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Salvar cadastro'}).click();await page.getByRole('status').filter({hasText:'Cadastro salvo'}).waitFor();
 assert.equal('empresa_sigla' in writes.at(-1),false);
 await page.getByLabel('Buscar motorista pelo nome').fill('joao');await page.getByRole('cell',{name:'João teste',exact:true}).waitFor();
 await nav('Veículos');await page.getByRole('button',{name:'+ Novo veículo'}).click();
 await page.getByLabel('Placa',{exact:true}).fill('ABC1234');await page.getByLabel('Tipo de veículo').selectOption('1');await page.getByLabel('Proprietário',{exact:true}).fill('Proprietário teste');await page.getByLabel('CPF/CNPJ do proprietário').fill('11222333000181');await page.getByLabel('Empresa',{exact:true}).selectOption('AZN');
 await mkdir('artifacts/registrations',{recursive:true});await page.screenshot({path:'artifacts/registrations/veiculo.png',fullPage:true});
 await page.getByRole('button',{name:'Salvar cadastro'}).click();await page.getByRole('status').filter({hasText:'Cadastro salvo'}).waitFor();
 assert.equal(writes.at(-1).owner,'11222333000181');assert.equal(writes.at(-1).empresa_sigla,'AZN');assert.equal('second_payer_percent' in writes.at(-1),false);assert.deepEqual(errors,[]);
 console.log('Empresas, cadastro de motorista por nome e cadastro de veículo aprovados no Edge (API simulada).');
}finally{await browser.close();}
