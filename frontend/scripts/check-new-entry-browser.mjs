import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});const writes=[],deletes=[];
 await page.route('**/api/**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname;let data=[];
  if(path.endsWith('/auth/login'))data={accessToken:'test',user:{id:1,cod:2,name:'Operador',unit:100,isAdmin:false},permissions:[]};
  else if(r.method()==='DELETE'){deletes.push(path);data={deleted:true};}
  else if(r.method()==='POST'||r.method()==='PUT'){writes.push(r.postDataJSON());data={entry:{numero:10}};}
  else if(path.endsWith('/freight-entries/number/10'))data={entry:{id:90,numero:10,manifesto_id:null,placa:'ABC1234',semana:'3926',motorista:'Motorista teste',tipo_veiculo:'Truck',codigo_despesa:'0055',nome_despesa:'ZONA AZUL',tipo_despesa:'Credito',data_lancamento:'2026-09-21',valor:'25.50',descricao:'Original',departamento:'Operação',pago:false,fechamento_id:null},manifesto:null};
  else if(path.endsWith('/weeks'))data=[{codigo:'3926',data_inicio:'2026-09-20',data_fim:'2026-09-26'}];
  else if(path.endsWith('/freight-expenses'))data=[{id:3,codigo:'0055',nome:'ZONA AZUL',tipo:'Credito',ativo:true}];
  else if(path.endsWith('/drivers'))data=[{cpf:'12345678901',name:'Motorista teste'}];
  else if(path.endsWith('/manifests'))data=[{id:1,manifestos:'M123',placa:'ABC1234',motorista:'Motorista teste',tipo_veiculo:'Truck',semana:'2026-09-21',fechamento_id:null,num_fechamento:null}];
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:5173');await page.getByLabel('Código do usuário').fill('2');await page.getByLabel('Senha',{exact:true}).fill('test');await page.getByRole('button',{name:'Entrar →'}).click();
 await page.getByRole('button',{name:/^Menu/}).click();await page.getByRole('button',{name:'Lançamentos',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Excluir lançamento',exact:true}).count(),0);
 await page.getByLabel('Placa',{exact:true}).fill('ABC1234');await page.getByLabel('Semana',{exact:true}).selectOption('3926');await page.getByLabel('Data do lançamento').fill('2026-09-21');await page.getByLabel('Despesa',{exact:true}).selectOption('3');await page.getByLabel('Valor do lançamento').fill('25.50');
 await mkdir('artifacts/entries',{recursive:true});await page.screenshot({path:'artifacts/entries/novo-sem-manifesto.png',fullPage:true});
 await page.getByRole('button',{name:'Salvar lançamento',exact:true}).click();await page.getByRole('status').filter({hasText:'Lançamento 10 salvo'}).waitFor();
 assert.equal(writes[0].manifesto_id,undefined);assert.equal(writes[0].semana,'3926');
 await page.getByLabel('Manifesto').fill('M123');await page.getByLabel('Manifesto').press('Tab');await page.getByLabel('Motorista',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Motorista',{exact:true}).locator('option:checked').textContent(),'Motorista teste');
 await page.getByLabel('Despesa',{exact:true}).selectOption('3');await page.getByLabel('Valor do lançamento').fill('12');await page.getByRole('button',{name:'Salvar lançamento',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Lançamento 10 salvo com sucesso.'}).waitFor();assert.equal(writes[1].manifesto_id,1);
 await page.getByRole('button',{name:'Editar',exact:true}).click();
 await page.getByLabel('Núm. lançamento').fill('10');await page.getByLabel('Núm. lançamento').press('Enter');
 await page.waitForFunction(()=>document.querySelector('textarea')?.value==='Original');
 await page.getByLabel('Valor do lançamento').fill('40');
 await page.screenshot({path:'artifacts/entries/editar-por-numero.png',fullPage:true});
 const update=page.waitForRequest(r=>r.method()==='PUT'&&r.url().endsWith('/freight-entries/90'));
 await page.getByRole('button',{name:'Salvar lançamento',exact:true}).click();await update;
 await page.getByRole('status').filter({hasText:'Lançamento 10 salvo'}).waitFor();assert.equal(writes[2].valor,40);assert.equal(writes[2].departamento,'Operação');
 await page.getByRole('button',{name:'Excluir lançamento',exact:true}).click();
 await page.getByText(/Excluir o lançamento 10.*40,00/).waitFor();assert.equal(deletes.length,0);
 await page.getByRole('button',{name:'Confirmar exclusão'}).click();await page.getByText('Lançamento 10 excluído com sucesso.').waitFor();
 assert.deepEqual(deletes,['/api/freight-entries/90']);assert.equal(await page.getByRole('button',{name:'Excluir lançamento',exact:true}).count(),0);
 console.log('Inclusão, edição e exclusão confirmada aprovadas no Edge (API simulada).');
}finally{await browser.close();}
